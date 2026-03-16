/**
 * supabase-storage.js — Supabase 기반 사용자별 데이터 저장소 (ES module)
 *
 * 사용자별 데이터 격리 + 오프라인 폴백 (IndexedDB)
 *
 * API (기존 storage.js와 호환):
 *   appStorage.ready          — Promise: DB 초기화 + Supabase prefetch 완료
 *   appStorage.getSync(key)   — 캐시에서 동기 읽기
 *   appStorage.get(key)       — Promise<value>
 *   appStorage.set(key, val)  — 캐시 즉시 반영 + Supabase 비동기 쓰기
 *   appStorage.remove(key)    — 캐시 + Supabase 삭제
 *   appStorage.setUserId(userId) — 사용자 ID 설정
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ── Config fetch 완료 대기 (버그 #2 수정: 레이스 컨디션 방지) ──
if (window.__supabaseConfigReady) {
  await window.__supabaseConfigReady;
}

(async function () {
  const SUPABASE_URL = window.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

  // URL/KEY가 비어있으면 오프라인 모드
  const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  if (!supabase) {
    console.warn("appStorage: Supabase URL/KEY 없음 — 오프라인 모드");
  }

  // ── 상태 변수 ──
  const _cache = {};
  const _txCache = {}; // 거래 데이터 캐시 (연도별)
  let _db = null;
  let _offlineMode = !supabase;
  let _userId = null;
  let _readyResolve;
  const _readyPromise = new Promise((resolve) => {
    _readyResolve = resolve;
  });

  const STORE_NAME = "kv";
  const DB_NAME = "dongkuk_dashboard";
  const MIGRATE_KEYS = [
    "planClipboardDataByYear",
    "rawTransactionDataByYear",
    "gradeMacroMappings",
    "supplierAdminItems",
    "noticesData",
    "schedulesData",
    "usersData"
  ];

  // ── IndexedDB 헬퍼 ──
  function _openDB() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function _readAllFromIDB(db) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function _idbPut(key, value) {
    if (!_db) return;
    try {
      const tx = _db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key, value });
    } catch (err) {
      // 무시
    }
  }

  function _idbDelete(key) {
    if (!_db) return;
    try {
      const tx = _db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
    } catch (err) {
      // 무시
    }
  }

  // ── localStorage 폴백 ──
  function _lsGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  function _lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 용량 초과 등
    }
  }

  // ── 데이터 변환 (Supabase snake_case ↔ 앱 camelCase) ──
  function _toStorageFormat(key, dbRecord) {
    if (key === "noticesData") {
      return {
        data: (dbRecord || []).map((notice) => ({
          id: notice.id,
          title: notice.title,
          content: notice.content,
          author: notice.author,
          password: notice.password,
          pinned: notice.pinned,
          createdAt: notice.created_at
        }))
      };
    }

    if (key === "schedulesData") {
      return {
        data: (dbRecord || []).map((sched) => ({
          id: sched.id,
          member: sched.member,
          type: sched.type,
          startDate: sched.start_date,
          endDate: sched.end_date,
          memo: sched.memo
        }))
      };
    }

    if (key === "supplierAdminItems") {
      return {
        data: (dbRecord || []).map((supplier) => ({
          code: supplier.code,
          name: supplier.name,
          region: supplier.region,
          owner: supplier.owner,
          phone: supplier.phone,
          monthlyCapacity: supplier.monthly_capacity,
          yearlySupply: supplier.yearly_supply,
          trustGrade: supplier.trust_grade,
          performanceRate: supplier.performance_rate
        }))
      };
    }

    if (key === "gradeMacroMappings") {
      return dbRecord?.mappings || {};
    }

    if (key === "planClipboardDataByYear") {
      const result = {};
      for (const record of dbRecord || []) {
        result[record.year] = {
          pastedAt: record.pasted_at,
          monthly: record.monthly
        };
      }
      return result;
    }

    if (key === "rawTransactionDataByYear") {
      const result = {};
      for (const record of dbRecord || []) {
        const year = String(record.year);
        if (!result[year]) result[year] = [];
        result[year].push({
          date: record.date,
          month: record.month,
          supplier: record.supplier,
          detailedGrade: record.detailed_grade,
          macro: record.macro,
          unitPrice: record.unit_price,
          amount: record.amount,
          qty: record.qty
        });
      }
      return result;
    }

    return dbRecord;
  }

  function _toDBFormat(key, storageValue) {
    if (key === "noticesData" && storageValue?.data) {
      return storageValue.data.map((notice) => ({
        id: notice.id,
        title: notice.title,
        content: notice.content,
        author: notice.author,
        password: notice.password,
        pinned: notice.pinned,
        created_at: notice.createdAt
      }));
    }

    if (key === "schedulesData" && storageValue?.data) {
      return storageValue.data.map((sched) => ({
        id: sched.id,
        member: sched.member,
        type: sched.type,
        start_date: sched.startDate,
        end_date: sched.endDate,
        memo: sched.memo
      }));
    }

    if (key === "supplierAdminItems" && storageValue?.data) {
      return storageValue.data.map((supplier) => ({
        code: supplier.code,
        name: supplier.name,
        region: supplier.region,
        owner: supplier.owner,
        phone: supplier.phone,
        monthly_capacity: supplier.monthlyCapacity,
        yearly_supply: supplier.yearlySupply,
        trust_grade: supplier.trustGrade,
        performance_rate: supplier.performanceRate
      }));
    }

    if (key === "gradeMacroMappings" && typeof storageValue === "object") {
      return { mappings: storageValue };
    }

    if (key === "planClipboardDataByYear" && typeof storageValue === "object") {
      const result = [];
      for (const [year, data] of Object.entries(storageValue)) {
        result.push({
          year,
          pasted_at: data.pastedAt,
          monthly: data.monthly
        });
      }
      return result;
    }

    if (key === "rawTransactionDataByYear" && typeof storageValue === "object") {
      const result = [];
      for (const [year, transactions] of Object.entries(storageValue)) {
        for (const tx of transactions || []) {
          result.push({
            year: Number(year),
            date: tx.date,
            month: tx.month,
            supplier: tx.supplier,
            detailed_grade: tx.detailedGrade,
            macro: tx.macro,
            unit_price: tx.unitPrice,
            amount: tx.amount,
            qty: tx.qty
          });
        }
      }
      return result;
    }

    return storageValue;
  }

  // ── Prefetch (startup) ──
  async function _prefetch() {
    if (!_userId || _offlineMode) {
      console.warn("appStorage: prefetch skipped", !_userId ? "(userId not set)" : "(offline mode)");
      _readyResolve();
      return;
    }

    try {
      // 1. notices
      const { data: notices, error: noticesErr } = await supabase
        .from("notices")
        .select("*")
        .eq("user_id", _userId);
      if (!noticesErr) {
        _cache.noticesData = _toStorageFormat("noticesData", notices);
      }

      // 2. schedules
      const { data: schedules, error: schedulesErr } = await supabase
        .from("schedules")
        .select("*")
        .eq("user_id", _userId);
      if (!schedulesErr) {
        _cache.schedulesData = _toStorageFormat("schedulesData", schedules);
      }

      // 3. supplier_admins
      const { data: suppliers, error: suppliersErr } = await supabase
        .from("supplier_admins")
        .select("*")
        .eq("user_id", _userId);
      if (!suppliersErr) {
        _cache.supplierAdminItems = _toStorageFormat(
          "supplierAdminItems",
          suppliers
        );
      }

      // 4. grade_mappings
      const { data: gradeMappings, error: gradeMappingsErr } = await supabase
        .from("grade_mappings")
        .select("mappings")
        .eq("user_id", _userId)
        .single();
      if (!gradeMappingsErr && gradeMappings) {
        _cache.gradeMacroMappings = gradeMappings.mappings || {};
      }

      // 5. plan_data
      const { data: planData, error: planDataErr } = await supabase
        .from("plan_data")
        .select("*")
        .eq("user_id", _userId);
      if (!planDataErr) {
        _cache.planClipboardDataByYear = _toStorageFormat(
          "planClipboardDataByYear",
          planData
        );
      }

      // 6. 거래 데이터 — 현재 연도 + IDB에 캐시된 연도 로드
      try {
        const currentYear = new Date().getFullYear();
        const yearsToLoad = new Set([String(currentYear)]);

        // IDB 캐시에 이미 있는 연도도 Supabase에서 최신화
        const idbTx = _cache.rawTransactionDataByYear;
        if (idbTx && typeof idbTx === "object") {
          for (const y of Object.keys(idbTx)) {
            yearsToLoad.add(String(y));
          }
        }

        for (const year of yearsToLoad) {
          await _prefetchTransactionsForYear(year);
        }
      } catch (txErr) {
        console.warn("appStorage: transaction prefetch partial failure", txErr);
      }

      console.log("appStorage: Supabase prefetch complete");
    } catch (err) {
      console.error("appStorage: Supabase prefetch error, falling back to IndexedDB", err);
      _offlineMode = true;

      // IndexedDB 폴백: 모든 데이터를 캐시에 로드
      if (_db) {
        try {
          const allRecords = await _readAllFromIDB(_db);
          for (const record of allRecords) {
            _cache[record.key] = record.value;
          }
          console.log("appStorage: IndexedDB fallback loaded", allRecords.length, "records");
        } catch (idbErr) {
          console.error("appStorage: IndexedDB fallback also failed", idbErr);
        }
      }
    }

    _readyResolve();
  }

  // ── Lazy-load transactions by year ──
  async function _prefetchTransactionsForYear(year) {
    if (!_userId || _txCache[year] || _offlineMode) {
      return;
    }

    try {
      const { data: transactions, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", _userId)
        .eq("year", Number(year))
        .order("date", { ascending: true });

      if (!error) {
        _txCache[year] = transactions || [];
        _cache.rawTransactionDataByYear =
          _cache.rawTransactionDataByYear || {};
        _cache.rawTransactionDataByYear[year] = (transactions || []).map(
          (tx) => {
            let month = Number(tx.month);
            if (!(month >= 1 && month <= 12) && tx.date) {
              const m = String(tx.date).match(/\d{4}[-\/.](\d{1,2})/);
              if (m) month = Number(m[1]);
            }
            return {
              date: tx.date,
              month: month || 0,
              supplier: tx.supplier,
              detailedGrade: tx.detailed_grade,
              macro: tx.macro,
              unitPrice: tx.unit_price,
              amount: tx.amount,
              qty: tx.qty
            };
          }
        );
      }
    } catch (err) {
      console.error(`appStorage: failed to load transactions for ${year}`, err);
    }
  }

  // ── Public API ──
  const appStorage = {
    ready: _readyPromise,

    supabaseClient: supabase,

    async setUserId(userId) {
      _userId = userId;
      // userId 설정 시 즉시 prefetch 실행 + ready resolve
      if (userId) {
        await _prefetch();
      } else {
        _readyResolve();
      }
    },

    // userId 없이 IDB 캐시만으로 ready를 resolve (비로그인 폴백)
    resolveWithoutUser() {
      if (!_userId) {
        _readyResolve();
      }
    },

    getSync(key) {
      return _cache[key];
    },

    async get(key) {
      await this.ready;
      return _cache[key];
    },

    async set(key, val) {
      // 캐시에 즉시 반영
      _cache[key] = val;
      _idbPut(key, val);

      // Supabase에 비동기 저장 (Promise 반환)
      if (_userId && !_offlineMode) {
        return this._saveToSupabase(key, val).catch((err) => {
          console.error(`appStorage: failed to save ${key}`, err);
          throw err;
        });
      }
    },

    async remove(key) {
      delete _cache[key];
      _idbDelete(key);

      // Supabase에서도 삭제
      if (_userId && !_offlineMode) {
        this._deleteFromSupabase(key).catch((err) => {
          console.error(`appStorage: failed to delete ${key}`, err);
        });
      }
    },

    async _saveToSupabase(key, val) {
      if (!_userId || !supabase) return;

      try {
        const dbVal = _toDBFormat(key, val);

        // 단순 테이블들
        if (key === "noticesData" && val?.data) {
          for (const notice of val.data) {
            await supabase
              .from("notices")
              .upsert({
                id: notice.id,
                user_id: _userId,
                title: notice.title,
                content: notice.content,
                author: notice.author,
                password: notice.password,
                pinned: notice.pinned,
                created_at: notice.createdAt
              });
          }
          return;
        }

        if (key === "schedulesData" && val?.data) {
          for (const sched of val.data) {
            await supabase
              .from("schedules")
              .upsert({
                id: sched.id,
                user_id: _userId,
                member: sched.member,
                type: sched.type,
                start_date: sched.startDate,
                end_date: sched.endDate,
                memo: sched.memo
              });
          }
          return;
        }

        if (key === "supplierAdminItems" && val?.data) {
          for (const supplier of val.data) {
            await supabase
              .from("supplier_admins")
              .upsert({
                user_id: _userId,
                code: supplier.code,
                name: supplier.name,
                region: supplier.region,
                owner: supplier.owner,
                phone: supplier.phone,
                monthly_capacity: supplier.monthlyCapacity,
                yearly_supply: supplier.yearlySupply,
                trust_grade: supplier.trustGrade,
                performance_rate: supplier.performanceRate
              });
          }
          return;
        }

        if (key === "gradeMacroMappings" && typeof val === "object") {
          await supabase
            .from("grade_mappings")
            .upsert({
              user_id: _userId,
              mappings: val
            }, { onConflict: "user_id" });
          return;
        }

        if (key === "planClipboardDataByYear" && typeof val === "object") {
          const planList = _toDBFormat(key, val);
          for (const plan of planList) {
            const { error } = await supabase
              .from("plan_data")
              .upsert({
                user_id: _userId,
                year: plan.year,
                pasted_at: plan.pasted_at,
                monthly: plan.monthly
              }, { onConflict: "year" });
            if (error) {
              console.error(`appStorage: failed to upsert plan_data for year ${plan.year}`, error);
              throw error;
            }
          }
          return;
        }

        if (key === "rawTransactionDataByYear" && typeof val === "object") {
          // 연도별로 순회하여 각 연도 데이터를 delete + insert
          for (const [year, transactions] of Object.entries(val)) {
            const yearNum = Number(year);
            const txRows = (transactions || []).map(tx => ({
              user_id: _userId,
              year: yearNum,
              date: tx.date,
              month: tx.month,
              supplier: tx.supplier,
              detailed_grade: tx.detailedGrade,
              macro: tx.macro,
              unit_price: tx.unitPrice || 0,
              amount: tx.amount || 0,
              qty: tx.qty || 0
            }));

            // 해당 연도의 기존 데이터 삭제
            await supabase
              .from("transactions")
              .delete()
              .eq("user_id", _userId)
              .eq("year", yearNum);

            // 새 데이터 batch insert
            if (txRows.length > 0) {
              const batchSize = 1000;
              for (let i = 0; i < txRows.length; i += batchSize) {
                const batch = txRows.slice(i, i + batchSize);
                const { error } = await supabase
                  .from("transactions")
                  .insert(batch);
                if (error) {
                  console.error(`appStorage: failed to insert transactions batch for year ${year}`, error);
                  throw error;
                }
              }
            }
          }
          return;
        }
      } catch (err) {
        throw err;
      }
    },

    async _deleteFromSupabase(key) {
      if (!_userId || !supabase) return;

      try {
        if (key === "noticesData") {
          await supabase
            .from("notices")
            .delete()
            .eq("user_id", _userId);
        } else if (key === "schedulesData") {
          await supabase
            .from("schedules")
            .delete()
            .eq("user_id", _userId);
        } else if (key === "supplierAdminItems") {
          await supabase
            .from("supplier_admins")
            .delete()
            .eq("user_id", _userId);
        } else if (key === "gradeMacroMappings") {
          await supabase
            .from("grade_mappings")
            .delete()
            .eq("user_id", _userId);
        } else if (key === "planClipboardDataByYear") {
          await supabase
            .from("plan_data")
            .delete()
            .eq("user_id", _userId);
        } else if (key === "rawTransactionDataByYear") {
          await supabase
            .from("transactions")
            .delete()
            .eq("user_id", _userId);
        }
      } catch (err) {
        throw err;
      }
    },

    prefetchTransactionsForYear(year) {
      return _prefetchTransactionsForYear(year);
    }
  };

  // ── 초기화 ──
  try {
    _db = await _openDB();
    console.log("appStorage: IndexedDB opened");

    // IDB 데이터를 _cache에 즉시 로드 (오프라인 폴백 보장)
    try {
      const allRecords = await _readAllFromIDB(_db);
      for (const record of allRecords) {
        _cache[record.key] = record.value;
      }
      console.log("appStorage: IDB cache loaded", allRecords.length, "records");
    } catch (idbReadErr) {
      console.warn("appStorage: failed to read IDB cache", idbReadErr);
    }
  } catch (err) {
    console.warn("appStorage: IndexedDB unavailable", err);
    _offlineMode = true;
  }

  // ready는 setUserId() → _prefetch() 완료 시 resolve됨.
  // setUserId()가 호출되지 않는 경우를 대비한 폴백은 app.js에서 처리.

  window.appStorage = appStorage;

  // app.js에 모듈 로딩 완료 시그널 (버그 #1 수정: 실행 순서 보장)
  if (window.__appStorageReadyResolve) {
    window.__appStorageReadyResolve();
  }
})();
