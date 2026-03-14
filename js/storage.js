/**
 * appStorage — IndexedDB 기반 키-값 저장소 (인메모리 캐시 + 비동기 영속화)
 *
 * API:
 *   appStorage.ready          — Promise: DB 초기화 + 마이그레이션 완료
 *   appStorage.getSync(key)   — 캐시에서 동기 읽기
 *   appStorage.get(key)       — Promise<value>
 *   appStorage.set(key, val)  — 캐시 즉시 반영 + IDB 비동기 기록
 *   appStorage.remove(key)    — 캐시 + IDB 삭제
 */
(function () {
  var DB_NAME = "dongkuk_dashboard";
  var DB_VERSION = 1;
  var STORE_NAME = "kv";
  var MIGRATED_FLAG = "__idb_migrated";

  var MIGRATE_KEYS = [
    "planClipboardDataByYear",
    "rawTransactionDataByYear",
    "gradeMacroMappings",
    "supplierAdminItems",
    "noticesData",
    "schedulesData",
    "usersData"
  ];

  var _cache = {};
  var _db = null;
  var _fallbackMode = false;
  var _readyResolve;
  var _readyPromise = new Promise(function (resolve) {
    _readyResolve = resolve;
  });

  // ── IndexedDB 유틸 ──

  function _openDB() {
    return new Promise(function (resolve, reject) {
      var request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
      request.onerror = function (event) {
        reject(event.target.error);
      };
    });
  }

  function _readAll(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, "readonly");
      var store = tx.objectStore(STORE_NAME);
      var request = store.getAll();
      request.onsuccess = function () {
        resolve(request.result || []);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function _idbPut(key, value) {
    if (!_db) return;
    try {
      var tx = _db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key: key, value: value });
    } catch (err) {
      // IDB write 실패 — 캐시에는 이미 반영됨
    }
  }

  function _idbDelete(key) {
    if (!_db) return;
    try {
      var tx = _db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
    } catch (err) {
      // IDB delete 실패
    }
  }

  // ── localStorage 마이그레이션 ──

  function _migrateFromLocalStorage() {
    if (_fallbackMode) return;
    try {
      if (localStorage.getItem(MIGRATED_FLAG)) return;
    } catch (e) {
      return;
    }

    MIGRATE_KEYS.forEach(function (key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return;
        var value;
        try {
          value = JSON.parse(raw);
        } catch (e) {
          value = raw;
        }
        _cache[key] = value;
        _idbPut(key, value);
        localStorage.removeItem(key);
      } catch (e) {
        // 개별 키 마이그레이션 실패 — 무시
      }
    });

    try {
      localStorage.setItem(MIGRATED_FLAG, "1");
    } catch (e) {
      // 플래그 저장 실패
    }
  }

  // ── localStorage 폴백 ──

  function _lsGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      return JSON.parse(raw);
    } catch (e) {
      return undefined;
    }
  }

  function _lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 용량 초과 등
    }
  }

  function _lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // 무시
    }
  }

  // ── 초기화 ──

  function _init() {
    _openDB()
      .then(function (db) {
        _db = db;
        return _readAll(db);
      })
      .then(function (records) {
        records.forEach(function (record) {
          _cache[record.key] = record.value;
        });
        _migrateFromLocalStorage();
        _readyResolve();
      })
      .catch(function () {
        // IndexedDB 사용 불가 — localStorage 폴백
        _fallbackMode = true;
        _readyResolve();
      });
  }

  // ── 공개 API ──

  window.appStorage = {
    ready: _readyPromise,

    getSync: function (key) {
      if (_fallbackMode) return _lsGet(key);
      return _cache[key];
    },

    get: function (key) {
      var self = this;
      return _readyPromise.then(function () {
        return self.getSync(key);
      });
    },

    set: function (key, value) {
      if (_fallbackMode) {
        _lsSet(key, value);
        return;
      }
      _cache[key] = value;
      _idbPut(key, value);
    },

    remove: function (key) {
      if (_fallbackMode) {
        _lsRemove(key);
        return;
      }
      delete _cache[key];
      _idbDelete(key);
    }
  };

  _init();
})();
