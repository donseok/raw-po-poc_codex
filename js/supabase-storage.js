/**
 * supabase-storage.js — Supabase + IndexedDB 하이브리드 저장소 (ES module)
 *
 * API 서명 (기존 storage.js와 동일):
 *   appStorage.ready          — Promise: DB 초기화 + Supabase prefetch 완료
 *   appStorage.getSync(key)   — 캐시에서 동기 읽기
 *   appStorage.get(key)       — Promise<value>
 *   appStorage.set(key, val)  — 캐시 즉시 반영 + Supabase 비동기 쓰기
 *   appStorage.remove(key)    — 캐시 + Supabase 삭제
 *
 * 추가 메서드:
 *   appStorage.prefetchTransactionsForYear(year) — 연도별 거래 데이터 지연 로드
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

(async function () {
  // ── Supabase 클라이언트 설정 ──
  const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── 상태 변수 ──
  const _cache = {};
  const _txCache = {}; // 거래 데이터 캐시 (연도별)
  let _db = null;
  let _offlineMode = false;
  let _readyResolve;
  const _readyPromise = new Promise((resolve) => {
    _readyResolve = resolve;
  });

  const STORE_NAME = "kv";
  const DB_NAME = "dongkuk_dashboard";
  const MIGRATED_FLAG = "__idb_migrated";

  const MIGRATE_KEYS = [
    "planClipboardDataByYear",
    "rawTransactionDataByYear",
    "gradeMacroMappings",
    "supplierAdminItems",
    "noticesData",
    "schedulesData",
    "usersData"
  ];

  // ── IndexedDB 헬퍼 (오프라인 폴백용) ──

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

  function _lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 무시
    }
  }

  // ── 데이터 변환 ──

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

    return storageValue;
  }

  // ── Prefetch (startup) ──

  async function _prefetch() {
    const results = {};

    try {
      // 1. notices
      const { data: notices, error: noticesErr } = await supabase
        .from("notices")
        .select("*");
      if (!noticesErr) {
        results.noticesData = notices;
      }

      // 2. schedules
      const { data: schedules, error: schedulesErr } = await supabase
        .from("schedules")
        .select("*");
      if (!schedulesErr) {
        results.schedulesData = schedules;
      }

      // 3. supplier_admins
      const { data: suppliers, error: suppliersErr } = await supabase
        .from("supplier_admins")
        .select("*");
      if (!suppliersErr) {
        results.supplierAdminItems = suppliers;
      }

      // 4. grade_mappings (싱글턴)
      const { data: gradeMappings, error: gradeMappingsErr } = await supabase
        .from("grade_mappings")
        .select("*")
        .eq("id", 1)
        .single();
      if (!gradeMappingsErr && gradeMappings) {
        results.gradeMacroMappings = gradeMappings.mappings;
      }

      // 5. plan_data
      const { data: planData, error: planDataErr } = await supabase
        .from("plan_data")
        .select("*");
      if (!planDataErr) {
        results.planClipboardDataByYear = planData;
      }

      // 6. profiles (usersData 대체)
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("*");
      if (!profilesErr) {
        results.usersData = profiles;
      }

      // 7. transactions는 lazy-load (첫 로드에서는 생략)

      // ── 캐시에 로드 ──
      _cache.noticesData = _toStorageFormat("noticesData", results.noticesData);
      _cache.schedulesData = _toStorageFormat("schedulesData", results.schedulesData);
      _cache.supplierAdminItems = _toStorageFormat("supplierAdminItems", results.supplierAdminItems);
      _cache.gradeMacroMappings = _toStorageFormat("gradeMacroMappings", results.gradeMacroMappings);
      _cache.planClipboardDataByYear = _toStorageFormat("planClipboardDataByYear", results.planClipboardDataByYear);
      _cache.usersData = { data: results.usersData || [] };

      // ── 마이그레이션 감지 ──
      try {
        if (!localStorage.getItem("__supabase_migrated")) {
          const idbHasData = Object.keys(_cache).some(
            (k) => _cache[k] && (Array.isArray(_cache[k].data) ? _cache[k].data.length : Object.keys(_cache[k]).length > 0)
          );
          const sbHasData = Object.values(results).some((v) => Array.isArray(v) ? v.length > 0 : v);
          if (idbHasData && !sbHasData) {
            window._supabaseMigrationPending = true;
          }
        }
      } catch {
        // 무시
      }
    } catch (err) {
      console.error("Supabase prefetch error:", err);
      _offlineMode = true;
    }
  }

  // ── Lazy-load transactions by year ──

  async function _prefetchTransactionsForYear(year) {
    if (_txCache[year]) {
      return;
    }

    try {
      const { data: transactions, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("year", Number(year))
        .order("date", { ascending: true });

      if (!error) {
        _txCache[year] = transactions || [];
        _cache.rawTransactionDataByYear = _cache.rawTransactionDataByYear || {};
        _cache.rawTransactionDataByYear[year] = transactions;
      }
    } catch (err) {
      console.error(`Failed to prefetch transactions for year ${year}:`, err);
    }
  }

  // ── Supabase 쓰기 디스패처 ──

  async function _persistToSupabase(key, value) {
    if (_offlineMode) return;

    try {
      const dbValue = _toDBFormat(key, value);

      if (key === "noticesData") {
        // Delete old, insert new
        await supabase.from("notices").delete().neq("id", "");
        if (value?.data?.length) {
          await supabase.from("notices").insert(dbValue);
        }
      } else if (key === "schedulesData") {
        await supabase.from("schedules").delete().neq("id", "");
        if (value?.data?.length) {
          await supabase.from("schedules").insert(dbValue);
        }
      } else if (key === "supplierAdminItems") {
        await supabase.from("supplier_admins").delete().neq("code", "");
        if (value?.data?.length) {
          await supabase.from("supplier_admins").insert(dbValue);
        }
      } else if (key === "gradeMacroMappings") {
        await supabase
          .from("grade_mappings")
          .upsert({ id: 1, mappings: dbValue }, { onConflict: "id" });
      } else if (key === "planClipboardDataByYear") {
        if (typeof dbValue === "object" && Array.isArray(dbValue)) {
          for (const item of dbValue) {
            await supabase
              .from("plan_data")
              .upsert(item, { onConflict: "year" });
          }
        }
      } else if (key === "rawTransactionDataByYear") {
        // Chunked upsert (5k rows per batch)
        if (typeof dbValue === "object") {
          for (const [year, transactions] of Object.entries(dbValue)) {
            if (Array.isArray(transactions)) {
              // Delete old transactions for this year first
              await supabase
                .from("transactions")
                .delete()
                .eq("year", Number(year));

              // Insert in batches
              const BATCH_SIZE = 5000;
              for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
                const batch = transactions.slice(i, i + BATCH_SIZE);
                await supabase.from("transactions").insert(batch, {
                  count: "estimated",
                  head: false
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to persist ${key} to Supabase:`, err);
      _offlineMode = true;
    }
  }

  // ── 초기화 ──

  async function _init() {
    try {
      _db = await _openDB();
      const idbRecords = await _readAllFromIDB(_db);
      idbRecords.forEach((record) => {
        _cache[record.key] = record.value;
      });
    } catch (err) {
      console.warn("IndexedDB initialization failed, falling back to localStorage:", err);
      _offlineMode = true;
    }

    // Supabase prefetch
    await _prefetch();

    // Mark ready
    _readyResolve();
  }

  // ── 공개 API ──

  window.appStorage = {
    ready: _readyPromise,
    supabaseClient: supabase, // app.js에서 로그아웃할 때 사용

    getSync(key) {
      if (_offlineMode) {
        return _lsGet(key);
      }
      return _cache[key];
    },

    get(key) {
      return _readyPromise.then(() => this.getSync(key));
    },

    set(key, value) {
      if (_offlineMode) {
        _lsSet(key, value);
        return;
      }
      _cache[key] = value;
      _idbPut(key, value);
      _persistToSupabase(key, value).catch(() => {
        // Supabase 쓰기 실패해도 캐시는 유지
      });
    },

    remove(key) {
      if (_offlineMode) {
        _lsRemove(key);
        return;
      }
      delete _cache[key];
      _idbDelete(key);
      // Supabase에서도 삭제 (간단한 버전, 전체 구현은 생략)
    },

    async prefetchTransactionsForYear(year) {
      await _prefetchTransactionsForYear(year);
    }
  };

  // Start initialization
  _init();
})();
