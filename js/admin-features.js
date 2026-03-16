(function () {
  const STORAGE_KEYS = Object.freeze({
    notices: "noticesData",
    schedules: "schedulesData",
    users: "usersData"
  });

  const DEFAULT_NOTICES = [
    {
      id: "N-default-001",
      title: "[필독] 2026년 철스크랩 수급계획 시스템 사용 안내",
      content:
        "본 시스템은 동국제강 철스크랩 수급 계획 및 구매 관리를 위한 시스템입니다.\n\n주요 기능:\n1. 수급계획 - 월별 수급계획 수립 및 실적 관리\n2. 공장배분 - 인천/포항 공장별 배분 계획\n3. 구매발주 - 국내 철스크랩 구매 발주 관리\n4. 업체관리 - 공급업체 정보 및 평가\n5. 수입계약 - 수입 철스크랩 계약 관리\n6. 재고현황 - 공장별/품종별 재고 모니터링\n7. 통계분석 - 구매 실적 분석\n\n문의: 원료기획팀",
      author: "관리자",
      password: "admin1234",
      pinned: true,
      createdAt: "2026-01-02T09:00:00.000Z"
    },
    {
      id: "N-default-002",
      title: "[필독] 시스템 데이터 입력 가이드",
      content:
        "데이터 입력 시 참고사항:\n\n1. 신규 사용자 계정은 사용자관리 탭에서 등록합니다.\n2. 공지사항은 게시글별 비밀번호로 수정/삭제를 관리합니다.\n3. 팀 일정은 캘린더에 즉시 반영되며 브라우저에 자동 저장됩니다.\n4. 기본 계정은 아이디 dongkuk1 / 비밀번호 1234 입니다.",
      author: "관리자",
      password: "admin1234",
      pinned: true,
      createdAt: "2026-01-02T10:00:00.000Z"
    },
    {
      id: "N-default-003",
      title: "3월 수급계획 회의 안내",
      content:
        "3월 수급계획 조정 회의가 아래와 같이 진행됩니다.\n\n일시: 2026년 3월 15일(월) 14:00\n장소: 본사 3층 대회의실\n참석: 원료기획팀 전원\n\n안건:\n- 3월 실적 점검\n- 4월 수급계획 확정\n- 수입 계약 검토",
      author: "박영수",
      password: "1234",
      pinned: false,
      createdAt: "2026-03-10T09:00:00.000Z"
    },
    {
      id: "N-default-004",
      title: "포항공장 재고 점검 결과 공유",
      content:
        "2026년 3월 포항공장 재고 실사 결과를 공유드립니다.\n\n- 생철: 7,200톤 (적정)\n- 중량: 8,800톤 (적정)\n- 경량: 5,100톤 (부족 - 발주 필요)\n- 길로틴: 4,500톤 (부족 - 발주 필요)\n\n경량/길로틴 품종 추가 발주를 검토해주시기 바랍니다.",
      author: "박지영",
      password: "1234",
      pinned: false,
      createdAt: "2026-03-08T14:30:00.000Z"
    },
    {
      id: "N-default-005",
      title: "일본 HMS1 시세 동향 공유",
      content:
        "최근 일본 HMS1 시세가 상승 추세에 있어 공유드립니다.\n\n- 2월 평균: $368/톤\n- 3월 초 현재: $372/톤\n- 전망: $375~380/톤 예상\n\n수입 계약 시 참고 바랍니다.",
      author: "이돈석",
      password: "1234",
      pinned: false,
      createdAt: "2026-03-05T11:00:00.000Z"
    }
  ];

  const SCHEDULE_TYPES = ["오전반차", "오후반차", "반반차1", "반반차2", "반반차3", "반반차4", "휴가", "교육", "출장", "외근"];
  const SCHEDULE_COLORS = Object.freeze({
    오전반차: "#42a5f5",
    오후반차: "#1565c0",
    반반차1: "#7e57c2",
    반반차2: "#ab47bc",
    반반차3: "#8d6e63",
    반반차4: "#78909c",
    휴가: "#ef5350",
    교육: "#66bb6a",
    출장: "#ffa726",
    외근: "#26a69a"
  });
  const DEFAULT_SCHEDULES = [];
  const MULTI_DAY_TYPES = ["휴가", "교육", "출장"];

  const DEFAULT_USERS = [
    {
      id: "dongkuk1",
      password: "1234",
      name: "이돈석",
      dept: "원료기획팀",
      position: "팀장",
      email: "dslee@dongkuk.com",
      phone: "02-317-1001",
      role: "admin",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "dongkuk2",
      password: "1234",
      name: "박영수",
      dept: "원료기획팀",
      position: "대리",
      email: "yspark@dongkuk.com",
      phone: "02-317-1002",
      role: "user",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ];

  var noticesData = cloneData(DEFAULT_NOTICES);
  var schedulesData = cloneData(DEFAULT_SCHEDULES);
  var usersData = cloneData(DEFAULT_USERS);
  var noticeCurrentPage = 1;
  var userCurrentPage = 1;
  var calendarYear = new Date().getFullYear();
  var calendarMonth = new Date().getMonth();
  var NOTICE_PAGE_SIZE = 10;
  var USER_PAGE_SIZE = 10;

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function showModal(id) {
    var element = document.getElementById(id);
    if (element) {
      element.classList.add("show");
    }
  }

  function hideModal(id) {
    var element = document.getElementById(id);
    if (element) {
      element.classList.remove("show");
    }
  }

  function showToast(message, type) {
    var toast = document.getElementById("globalToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "globalToast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "toast " + (type || "info");
    requestAnimationFrame(function () {
      toast.classList.add("show");
    });
    clearTimeout(showToast.timerId);
    showToast.timerId = setTimeout(function () {
      toast.classList.remove("show");
    }, 2500);
  }

  function readStoredData(key, normalize) {
    var stored = window.appStorage ? window.appStorage.getSync(key) : undefined;
    var parsed;
    if (stored !== undefined) {
      parsed = stored;
    } else {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        localStorage.removeItem(key);
        return null;
      }
    }
    try {
      var normalized = normalize(parsed.data);
      if (!normalized) {
        throw new Error("Invalid storage payload");
      }
      return normalized;
    } catch (error) {
      if (window.appStorage) {
        window.appStorage.remove(key);
      }
      return null;
    }
  }

  function writeStoredData(key, data) {
    var envelope = {
      data: data,
      timestamp: new Date().toISOString()
    };
    if (window.appStorage) {
      window.appStorage.set(key, envelope);
    } else {
      localStorage.setItem(key, JSON.stringify(envelope));
    }
  }

  function generateNoticeId() {
    return "N-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }

  function generateScheduleId() {
    return "SCH-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }

  function normalizeNotice(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    if (!item.id || !item.title || !item.author || !item.password) {
      return null;
    }
    return {
      id: String(item.id),
      title: String(item.title).trim(),
      content: String(item.content || "").trim(),
      author: String(item.author).trim(),
      password: String(item.password),
      pinned: !!item.pinned,
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function normalizeNoticesData(data) {
    if (!Array.isArray(data)) {
      return null;
    }
    var result = [];
    data.forEach(function (item) {
      var normalized = normalizeNotice(item);
      if (normalized) {
        result.push(normalized);
      }
    });
    return result;
  }

  function getDefaultNoticeIds() {
    return DEFAULT_NOTICES.map(function (notice) {
      return notice.id;
    });
  }

  function loadNoticesFromStorage() {
    var saved = readStoredData(STORAGE_KEYS.notices, normalizeNoticesData);
    var defaultIds = getDefaultNoticeIds();
    noticesData = cloneData(DEFAULT_NOTICES);
    if (saved) {
      saved.forEach(function (item) {
        if (defaultIds.indexOf(item.id) === -1) {
          noticesData.push(item);
        }
      });
    }
    return noticesData;
  }

  function saveNoticesData() {
    var defaultIds = getDefaultNoticeIds();
    var localOnly = noticesData.filter(function (notice) {
      return defaultIds.indexOf(notice.id) === -1;
    });
    writeStoredData(STORAGE_KEYS.notices, localOnly);
  }

  function sortNotices() {
    noticesData.sort(function (left, right) {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
  }

  function renderNotices() {
    var list = document.getElementById("noticeList");
    var pagination = document.getElementById("noticePagination");
    if (!list || !pagination) {
      return;
    }

    sortNotices();

    if (!noticesData.length) {
      list.innerHTML = '<div class="notice-empty">등록된 공지사항이 없습니다.</div>';
      pagination.innerHTML = "";
      return;
    }

    var pinnedItems = noticesData.filter(function (item) {
      return item.pinned;
    });
    var normalItems = noticesData.filter(function (item) {
      return !item.pinned;
    });
    var totalPages = Math.max(1, Math.ceil(normalItems.length / NOTICE_PAGE_SIZE));
    if (noticeCurrentPage > totalPages) {
      noticeCurrentPage = totalPages;
    }
    if (noticeCurrentPage < 1) {
      noticeCurrentPage = 1;
    }

    var startIndex = (noticeCurrentPage - 1) * NOTICE_PAGE_SIZE;
    var pageItems = normalItems.slice(startIndex, startIndex + NOTICE_PAGE_SIZE);
    var displayItems = pinnedItems.concat(pageItems);
    var html =
      '<table><thead><tr><th style="width:70px" class="text-center">구분</th><th>제목</th><th style="width:100px">작성자</th><th style="width:110px">작성일</th></tr></thead><tbody>';

    displayItems.forEach(function (notice) {
      var date = new Date(notice.createdAt).toLocaleDateString("ko-KR");
      var badge = notice.pinned ? '<span class="badge badge-red">필독</span>' : "";
      html +=
        '<tr class="notice-row' +
        (notice.pinned ? " notice-pinned" : "") +
        '" onclick="viewNotice(\'' +
        notice.id +
        '\')" style="cursor:pointer">';
      html += '<td class="text-center" style="white-space:nowrap">' + badge + "</td>";
      html += '<td class="notice-title-cell">' + escapeHtml(notice.title) + "</td>";
      html += "<td>" + escapeHtml(notice.author) + "</td>";
      html += "<td>" + date + "</td>";
      html += "</tr>";
    });

    html += "</tbody></table>";
    list.innerHTML = html;

    var paginationHtml = "";
    paginationHtml +=
      '<button class="pagination-btn' +
      (noticeCurrentPage === 1 ? " disabled" : "") +
      '"' +
      (noticeCurrentPage === 1 ? " disabled" : ' onclick="goNoticePage(' + (noticeCurrentPage - 1) + ')"') +
      ">&laquo;</button>";
    for (var page = 1; page <= totalPages; page += 1) {
      paginationHtml +=
        '<button class="pagination-btn' +
        (page === noticeCurrentPage ? " active" : "") +
        '" onclick="goNoticePage(' +
        page +
        ')">' +
        page +
        "</button>";
    }
    paginationHtml +=
      '<button class="pagination-btn' +
      (noticeCurrentPage === totalPages ? " disabled" : "") +
      '"' +
      (noticeCurrentPage === totalPages
        ? " disabled"
        : ' onclick="goNoticePage(' + (noticeCurrentPage + 1) + ')"') +
      ">&raquo;</button>";
    pagination.innerHTML = paginationHtml;
  }

  function goNoticePage(page) {
    noticeCurrentPage = page;
    renderNotices();
  }

  function showNoticeForm(editId) {
    var isEdit = !!editId;
    document.getElementById("noticeFormTitle").textContent = isEdit ? "공지사항 수정" : "공지사항 등록";
    document.getElementById("noticeForm").dataset.editId = editId || "";
    document.getElementById("noticePasswordHint").style.display = isEdit ? "block" : "none";

    if (isEdit) {
      var notice = noticesData.find(function (item) {
        return item.id === editId;
      });
      if (!notice) {
        return;
      }
      document.getElementById("noticeTitle").value = notice.title;
      document.getElementById("noticeContent").value = notice.content;
      document.getElementById("noticeAuthor").value = notice.author;
      document.getElementById("noticePassword").value = "";
      document.getElementById("noticePinned").checked = notice.pinned;
    } else {
      document.getElementById("noticeTitle").value = "";
      document.getElementById("noticeContent").value = "";
      document.getElementById("noticeAuthor").value = "";
      document.getElementById("noticePassword").value = "";
      document.getElementById("noticePinned").checked = false;
    }

    showModal("noticeFormModal");
  }

  function submitNotice() {
    var editId = document.getElementById("noticeForm").dataset.editId;
    var title = document.getElementById("noticeTitle").value.trim();
    var content = document.getElementById("noticeContent").value.trim();
    var author = document.getElementById("noticeAuthor").value.trim();
    var password = document.getElementById("noticePassword").value;
    var pinned = document.getElementById("noticePinned").checked;

    if (!title) {
      showToast("제목을 입력해주세요.", "error");
      return;
    }
    if (!author) {
      showToast("작성자를 입력해주세요.", "error");
      return;
    }
    if (!password) {
      showToast("비밀번호를 입력해주세요.", "error");
      return;
    }

    if (editId) {
      var notice = noticesData.find(function (item) {
        return item.id === editId;
      });
      if (!notice) {
        return;
      }
      if (notice.password !== password) {
        showToast("비밀번호가 일치하지 않습니다.", "error");
        return;
      }
      notice.title = title;
      notice.content = content;
      notice.author = author;
      notice.pinned = pinned;
    } else {
      noticesData.push({
        id: generateNoticeId(),
        title: title,
        content: content,
        author: author,
        password: password,
        pinned: pinned,
        createdAt: new Date().toISOString()
      });
    }

    saveNoticesData();
    renderNotices();
    hideModal("noticeFormModal");
    showToast(editId ? "공지사항이 수정되었습니다." : "공지사항이 등록되었습니다.", "success");
  }

  function viewNotice(id) {
    var notice = noticesData.find(function (item) {
      return item.id === id;
    });
    if (!notice) {
      return;
    }

    var date = new Date(notice.createdAt).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    document.getElementById("viewNoticeTitle").textContent = notice.title;
    document.getElementById("viewNoticeMeta").textContent = notice.author + "  |  " + date;
    document.getElementById("viewNoticePinned").style.display = notice.pinned ? "inline-flex" : "none";
    document.getElementById("viewNoticeContent").textContent = notice.content || "(내용 없음)";
    document.getElementById("viewNoticeActions").dataset.noticeId = id;
    showModal("noticeViewModal");
  }

  function promptEditNotice() {
    var id = document.getElementById("viewNoticeActions").dataset.noticeId;
    hideModal("noticeViewModal");
    showNoticeForm(id);
  }

  function promptDeleteNotice() {
    var id = document.getElementById("viewNoticeActions").dataset.noticeId;
    hideModal("noticeViewModal");
    document.getElementById("deleteNoticeConfirm").dataset.noticeId = id;
    document.getElementById("deletePassword").value = "";
    showModal("noticeDeleteModal");
  }

  function confirmDeleteNotice() {
    var id = document.getElementById("deleteNoticeConfirm").dataset.noticeId;
    var password = document.getElementById("deletePassword").value;
    if (!password) {
      showToast("비밀번호를 입력해주세요.", "error");
      return;
    }
    var index = noticesData.findIndex(function (item) {
      return item.id === id;
    });
    if (index === -1) {
      return;
    }
    if (noticesData[index].password !== password) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    noticesData.splice(index, 1);
    saveNoticesData();
    renderNotices();
    hideModal("noticeDeleteModal");
    showToast("공지사항이 삭제되었습니다.", "success");
  }

  function normalizeSchedule(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    if (!item.id || !item.member || !item.type || !item.startDate) {
      return null;
    }
    if (SCHEDULE_TYPES.indexOf(item.type) === -1) {
      return null;
    }
    return {
      id: String(item.id),
      member: String(item.member).trim(),
      type: String(item.type),
      startDate: String(item.startDate),
      endDate: String(item.endDate || item.startDate),
      memo: String(item.memo || "").trim()
    };
  }

  function normalizeSchedulesArray(data) {
    if (!Array.isArray(data)) {
      return null;
    }
    var result = [];
    data.forEach(function (item) {
      var normalized = normalizeSchedule(item);
      if (normalized) {
        result.push(normalized);
      }
    });
    return result;
  }

  function getDefaultScheduleIds() {
    return DEFAULT_SCHEDULES.map(function (schedule) {
      return schedule.id;
    });
  }

  function loadSchedulesFromStorage() {
    var saved = readStoredData(STORAGE_KEYS.schedules, normalizeSchedulesArray);
    var defaultIds = getDefaultScheduleIds();
    schedulesData = cloneData(DEFAULT_SCHEDULES);
    if (saved) {
      saved.forEach(function (item) {
        if (defaultIds.indexOf(item.id) === -1) {
          schedulesData.push(item);
        }
      });
    }
  }

  function saveSchedulesData() {
    var defaultIds = getDefaultScheduleIds();
    var localOnly = schedulesData.filter(function (schedule) {
      return defaultIds.indexOf(schedule.id) === -1;
    });
    writeStoredData(STORAGE_KEYS.schedules, localOnly);
  }

  function renderCalendar() {
    var label = document.getElementById("calendarMonthLabel");
    var body = document.getElementById("calendarBody");
    if (!label || !body) {
      return;
    }

    label.textContent = calendarYear + "년 " + (calendarMonth + 1) + "월";

    var firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    var daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    var today = new Date();
    var todayKey =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");
    var daySchedules = {};

    for (var day = 1; day <= daysInMonth; day += 1) {
      var dayKey =
        calendarYear +
        "-" +
        String(calendarMonth + 1).padStart(2, "0") +
        "-" +
        String(day).padStart(2, "0");
      daySchedules[day] = [];
      schedulesData.forEach(function (schedule) {
        if (dayKey >= schedule.startDate && dayKey <= schedule.endDate) {
          daySchedules[day].push(schedule);
        }
      });
    }

    var html = "";
    var currentDay = 1;
    for (var row = 0; row < 6; row += 1) {
      if (currentDay > daysInMonth) {
        break;
      }
      html += "<tr>";
      for (var col = 0; col < 7; col += 1) {
        if ((row === 0 && col < firstDay) || currentDay > daysInMonth) {
          html += '<td class="calendar-cell calendar-empty"></td>';
          continue;
        }

        var currentKey =
          calendarYear +
          "-" +
          String(calendarMonth + 1).padStart(2, "0") +
          "-" +
          String(currentDay).padStart(2, "0");
        var cellClass = "calendar-cell";
        if (currentKey === todayKey) {
          cellClass += " calendar-today";
        }
        if (col === 0) {
          cellClass += " calendar-sun";
        }
        if (col === 6) {
          cellClass += " calendar-sat";
        }

        var schedules = daySchedules[currentDay];
        var eventsHtml = "";
        if (schedules.length) {
          cellClass += " calendar-has-schedule";
          schedules.slice(0, 3).forEach(function (schedule) {
            var color = SCHEDULE_COLORS[schedule.type] || "#9e9e9e";
            eventsHtml +=
              '<div class="calendar-event" style="background:' +
              color +
              '">' +
              escapeHtml(schedule.member) +
              " " +
              escapeHtml(schedule.type) +
              "</div>";
          });
          if (schedules.length > 3) {
            eventsHtml += '<div class="calendar-event-more">+' + (schedules.length - 3) + "</div>";
          }
        }

        html += '<td class="' + cellClass + '" onclick="showDaySchedules(' + calendarYear + "," + calendarMonth + "," + currentDay + ')">';
        html += '<div class="calendar-day-num">' + currentDay + "</div>";
        html += '<div class="calendar-events">' + eventsHtml + "</div>";
        html += "</td>";
        currentDay += 1;
      }
      html += "</tr>";
    }

    body.innerHTML = html;
  }

  function changeCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear -= 1;
    }
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear += 1;
    }
    renderCalendar();
  }

  function showDaySchedules(year, month, day) {
    var dateKey = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    var list = schedulesData.filter(function (schedule) {
      return dateKey >= schedule.startDate && dateKey <= schedule.endDate;
    });
    document.getElementById("scheduleDetailTitle").textContent =
      year + "년 " + (month + 1) + "월 " + day + "일 일정";

    var container = document.getElementById("scheduleDetailList");
    if (!list.length) {
      container.innerHTML = '<div class="notice-empty" style="padding:24px">등록된 일정이 없습니다.</div>';
    } else {
      var html =
        '<table><thead><tr><th>팀원</th><th>구분</th><th>기간</th><th style="width:50px"></th></tr></thead><tbody>';
      list.forEach(function (schedule) {
        var color = SCHEDULE_COLORS[schedule.type] || "#9e9e9e";
        var period =
          schedule.startDate === schedule.endDate
            ? schedule.startDate
            : schedule.startDate + " ~ " + schedule.endDate;
        html += "<tr>";
        html += "<td>" + escapeHtml(schedule.member) + "</td>";
        html +=
          '<td><span class="badge" style="background:' +
          color +
          '22;color:' +
          color +
          '">' +
          escapeHtml(schedule.type) +
          "</span></td>";
        html += '<td style="font-size:12px">' + period + "</td>";
        html +=
          '<td><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:11px" onclick="deleteSchedule(\'' +
          schedule.id +
          '\')">삭제</button></td>';
        html += "</tr>";
      });
      html += "</tbody></table>";
      container.innerHTML = html;
    }
    showModal("scheduleDetailModal");
  }

  function toggleEndDateGroup() {
    var type = document.getElementById("scheduleType").value;
    var group = document.getElementById("scheduleEndDateGroup");
    if (!group) {
      return;
    }
    if (MULTI_DAY_TYPES.indexOf(type) !== -1) {
      group.style.display = "";
    } else {
      group.style.display = "none";
      document.getElementById("scheduleEndDate").value = "";
    }
  }

  function showScheduleForm() {
    document.getElementById("scheduleMember").value = "";
    document.getElementById("scheduleType").value = "";
    document.getElementById("scheduleStartDate").value = "";
    document.getElementById("scheduleEndDate").value = "";
    document.getElementById("scheduleEndDateGroup").style.display = "none";
    showModal("scheduleFormModal");
  }

  function submitSchedule() {
    var member = document.getElementById("scheduleMember").value;
    var type = document.getElementById("scheduleType").value;
    var startDate = document.getElementById("scheduleStartDate").value;
    var useEndDate = MULTI_DAY_TYPES.indexOf(type) !== -1;
    var endDate = useEndDate ? document.getElementById("scheduleEndDate").value || startDate : startDate;

    if (!member) {
      showToast("팀원을 선택해주세요.", "error");
      return;
    }
    if (!type) {
      showToast("구분을 선택해주세요.", "error");
      return;
    }
    if (!startDate) {
      showToast("시작일을 입력해주세요.", "error");
      return;
    }
    if (useEndDate && endDate < startDate) {
      showToast("종료일은 시작일 이후여야 합니다.", "error");
      return;
    }

    var schedule = normalizeSchedule({
      id: generateScheduleId(),
      member: member,
      type: type,
      startDate: startDate,
      endDate: endDate,
      memo: ""
    });
    if (!schedule) {
      showToast("일정 정보를 올바르게 입력해주세요.", "error");
      return;
    }

    schedulesData.push(schedule);
    saveSchedulesData();
    renderCalendar();
    hideModal("scheduleFormModal");
    showToast("일정이 등록되었습니다.", "success");
  }

  function deleteSchedule(id) {
    var index = schedulesData.findIndex(function (schedule) {
      return schedule.id === id;
    });
    if (index === -1) {
      return;
    }
    schedulesData.splice(index, 1);
    saveSchedulesData();
    renderCalendar();
    hideModal("scheduleDetailModal");
    showToast("일정이 삭제되었습니다.", "success");
  }

  function normalizeUser(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    if (!item.id || !item.password || !item.name || !item.dept) {
      return null;
    }
    return {
      id: String(item.id).trim(),
      password: String(item.password),
      name: String(item.name).trim(),
      dept: String(item.dept).trim(),
      position: String(item.position || "").trim(),
      email: String(item.email || "").trim(),
      phone: String(item.phone || "").trim(),
      role: item.role === "admin" ? "admin" : "user",
      status: item.status === "inactive" ? "inactive" : "active",
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function normalizeUsersData(data) {
    if (!Array.isArray(data)) {
      return null;
    }
    var result = [];
    data.forEach(function (item) {
      var normalized = normalizeUser(item);
      if (normalized) {
        result.push(normalized);
      }
    });
    return result.length ? result : null;
  }

  function mapProfileToUser(profile) {
    return normalizeUser({
      id: profile.app_id,
      password: "",
      name: profile.name,
      dept: profile.dept,
      position: profile.position,
      email: profile.email || "",
      phone: profile.phone || "",
      role: profile.role,
      status: profile.status,
      createdAt: profile.created_at
    });
  }

  async function loadUsersFromStorage() {
    var supabase = window.appStorage && window.appStorage.supabaseClient;
    if (supabase) {
      try {
        var response = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });
        if (!response.error && Array.isArray(response.data) && response.data.length) {
          usersData = response.data
            .map(mapProfileToUser)
            .filter(function (item) {
              return !!item;
            });
          return usersData;
        }
      } catch (error) {
        console.warn("Failed to load users from profiles:", error);
      }
    }

    var saved = readStoredData(STORAGE_KEYS.users, normalizeUsersData);
    usersData = saved || cloneData(DEFAULT_USERS);
    return usersData;
  }

  function saveUsersData() {
    writeStoredData(STORAGE_KEYS.users, usersData);
  }

  function renderUsers() {
    var tbody = document.getElementById("userTable");
    var pagination = document.getElementById("userPagination");
    if (!tbody || !pagination) {
      return;
    }

    usersData.sort(function (left, right) {
      if (left.role !== right.role) {
        return left.role === "admin" ? -1 : 1;
      }
      return new Date(right.createdAt) - new Date(left.createdAt);
    });

    var totalPages = Math.max(1, Math.ceil(usersData.length / USER_PAGE_SIZE));
    if (userCurrentPage > totalPages) {
      userCurrentPage = totalPages;
    }
    if (userCurrentPage < 1) {
      userCurrentPage = 1;
    }

    var startIndex = (userCurrentPage - 1) * USER_PAGE_SIZE;
    var pageItems = usersData.slice(startIndex, startIndex + USER_PAGE_SIZE);
    var html = "";

    pageItems.forEach(function (user) {
      var date = new Date(user.createdAt).toLocaleDateString("ko-KR");
      var roleBadge =
        user.role === "admin"
          ? '<span class="badge badge-blue">관리자</span>'
          : '<span class="badge badge-gray">일반</span>';
      var statusBadge =
        user.status === "active"
          ? '<span class="status-indicator"><span class="status-dot green"></span>활성</span>'
          : '<span class="status-indicator"><span class="status-dot red"></span>비활성</span>';

      html += "<tr>";
      html += "<td><strong>" + escapeHtml(user.id) + "</strong></td>";
      html += "<td>" + escapeHtml(user.name) + "</td>";
      html += "<td>" + escapeHtml(user.dept) + "</td>";
      html += "<td>" + escapeHtml(user.position || "-") + "</td>";
      html += "<td>" + escapeHtml(user.email || "-") + "</td>";
      html += "<td>" + escapeHtml(user.phone || "-") + "</td>";
      html += '<td class="text-center">' + roleBadge + "</td>";
      html += '<td class="text-center">' + statusBadge + "</td>";
      html += "<td>" + date + "</td>";
      html += '<td class="text-center" style="white-space:nowrap">';
      html += '<button class="btn btn-outline btn-sm" onclick="editUser(\'' + user.id + '\')">수정</button> ';
      html += '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + user.id + '\')">삭제</button>';
      html += "</td>";
      html += "</tr>";
    });

    tbody.innerHTML = html;

    var total = usersData.length;
    var activeCount = usersData.filter(function (user) {
      return user.status === "active";
    }).length;
    var adminCount = usersData.filter(function (user) {
      return user.role === "admin";
    }).length;
    var inactiveCount = total - activeCount;
    document.getElementById("userKpi1").innerHTML =
      '<div class="kpi-label">전체 사용자</div><div class="kpi-value">' + total + "<small>명</small></div>";
    document.getElementById("userKpi2").innerHTML =
      '<div class="kpi-label">활성 사용자</div><div class="kpi-value">' + activeCount + "<small>명</small></div>";
    document.getElementById("userKpi3").innerHTML =
      '<div class="kpi-label">관리자</div><div class="kpi-value">' + adminCount + "<small>명</small></div>";
    document.getElementById("userKpi4").innerHTML =
      '<div class="kpi-label">비활성 사용자</div><div class="kpi-value">' + inactiveCount + "<small>명</small></div>";

    var paginationHtml = "";
    paginationHtml +=
      '<button class="pagination-btn' +
      (userCurrentPage === 1 ? " disabled" : "") +
      '"' +
      (userCurrentPage === 1 ? " disabled" : ' onclick="goUserPage(' + (userCurrentPage - 1) + ')"') +
      ">&laquo;</button>";
    for (var page = 1; page <= totalPages; page += 1) {
      paginationHtml +=
        '<button class="pagination-btn' +
        (page === userCurrentPage ? " active" : "") +
        '" onclick="goUserPage(' +
        page +
        ')">' +
        page +
        "</button>";
    }
    paginationHtml +=
      '<button class="pagination-btn' +
      (userCurrentPage === totalPages ? " disabled" : "") +
      '"' +
      (userCurrentPage === totalPages ? " disabled" : ' onclick="goUserPage(' + (userCurrentPage + 1) + ')"') +
      ">&raquo;</button>";
    pagination.innerHTML = paginationHtml;
  }

  function goUserPage(page) {
    userCurrentPage = page;
    renderUsers();
  }

  function showUserForm(editId) {
    var isEdit = !!editId;
    document.getElementById("userFormTitle").textContent = isEdit ? "사용자 수정" : "사용자 등록";
    document.getElementById("userForm").dataset.editId = editId || "";

    var idInput = document.getElementById("userIdInput");
    var passwordInput = document.getElementById("userPasswordInput");
    if (isEdit) {
      var user = usersData.find(function (item) {
        return item.id === editId;
      });
      if (!user) {
        return;
      }
      idInput.value = user.id;
      idInput.disabled = true;
      passwordInput.value = "";
      passwordInput.placeholder = "변경 시에만 입력";
      document.getElementById("userNameInput").value = user.name;
      document.getElementById("userDeptInput").value = user.dept;
      document.getElementById("userPositionInput").value = user.position || "사원";
      document.getElementById("userEmailInput").value = user.email;
      document.getElementById("userPhoneInput").value = user.phone;
      document.getElementById("userRoleInput").value = user.role;
      document.getElementById("userStatusInput").value = user.status;
    } else {
      idInput.value = "";
      idInput.disabled = false;
      passwordInput.value = "";
      passwordInput.placeholder = "비밀번호 입력";
      document.getElementById("userNameInput").value = "";
      document.getElementById("userDeptInput").value = "원료기획팀";
      document.getElementById("userPositionInput").value = "사원";
      document.getElementById("userEmailInput").value = "";
      document.getElementById("userPhoneInput").value = "";
      document.getElementById("userRoleInput").value = "user";
      document.getElementById("userStatusInput").value = "active";
    }

    showModal("userModal");
  }

  function submitUser() {
    var editId = document.getElementById("userForm").dataset.editId;
    var isEdit = !!editId;
    var id = document.getElementById("userIdInput").value.trim();
    var password = document.getElementById("userPasswordInput").value;
    var name = document.getElementById("userNameInput").value.trim();
    var dept = document.getElementById("userDeptInput").value.trim();
    var position = document.getElementById("userPositionInput").value;
    var email = document.getElementById("userEmailInput").value.trim();
    var phone = document.getElementById("userPhoneInput").value.trim();
    var role = document.getElementById("userRoleInput").value;
    var status = document.getElementById("userStatusInput").value;

    if (!id) {
      showToast("아이디를 입력해주세요.", "error");
      return;
    }
    if (/[^a-zA-Z0-9_]/.test(id)) {
      showToast("아이디는 영문, 숫자, 밑줄만 사용 가능합니다.", "error");
      return;
    }
    if (!isEdit && !password) {
      showToast("비밀번호를 입력해주세요.", "error");
      return;
    }
    if (!name) {
      showToast("이름을 입력해주세요.", "error");
      return;
    }
    if (!dept) {
      showToast("부서를 입력해주세요.", "error");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("이메일 형식이 올바르지 않습니다.", "error");
      return;
    }

    if (isEdit) {
      var currentUser = usersData.find(function (item) {
        return item.id === editId;
      });
      if (!currentUser) {
        return;
      }
      if (password) {
        currentUser.password = password;
      }
      currentUser.name = name;
      currentUser.dept = dept;
      currentUser.position = position;
      currentUser.email = email;
      currentUser.phone = phone;
      currentUser.role = role;
      currentUser.status = status;
    } else {
      // Supabase: 신규 사용자는 대시보드에서 생성 안내
      showToast(
        "신규 사용자는 Supabase 대시보드에서 생성해주세요. " +
        "1) 대시보드 Authentication > Users에서 계정 생성 후 " +
        "2) SQL Editor에서 profiles 테이블에 사용자 정보를 추가해주세요.",
        "warn"
      );
      return;

      /* 기존 로컬 저장 방식 (마이그레이션 완료 후 제거)
      if (
        usersData.some(function (item) {
          return item.id === id;
        })
      ) {
        showToast("이미 존재하는 아이디입니다.", "error");
        return;
      }
      usersData.push({
        id: id,
        password: password,
        name: name,
        dept: dept,
        position: position,
        email: email,
        phone: phone,
        role: role,
        status: status,
        createdAt: new Date().toISOString()
      });
      */
    }

    saveUsersData();
    renderUsers();
    if (typeof window.refreshLoggedInUserDisplay === "function") {
      window.refreshLoggedInUserDisplay();
    }
    hideModal("userModal");
    showToast(isEdit ? "사용자 정보가 수정되었습니다." : "사용자가 등록되었습니다.", "success");
  }

  function editUser(id) {
    showUserForm(id);
  }

  function deleteUser(id) {
    var user = usersData.find(function (item) {
      return item.id === id;
    });
    if (!user) {
      return;
    }

    try {
      var loggedIn = JSON.parse(sessionStorage.getItem("loggedInUser"));
      if (loggedIn && loggedIn.id === id) {
        showToast("현재 로그인한 계정은 삭제할 수 없습니다.", "error");
        return;
      }
    } catch (error) {
      // Legacy string sessions are ignored here.
    }

    if (!confirm('사용자 "' + user.name + " (" + user.id + ')" 을(를) 삭제하시겠습니까?')) {
      return;
    }

    usersData = usersData.filter(function (item) {
      return item.id !== id;
    });
    saveUsersData();
    renderUsers();
    showToast("사용자가 삭제되었습니다.", "success");
  }

  async function initAdminFeatures() {
    loadNoticesFromStorage();
    loadSchedulesFromStorage();
    await loadUsersFromStorage();
  }

  var adminFeaturesReady;
  if (window.appStorage) {
    adminFeaturesReady = window.appStorage.ready.then(function () {
      return initAdminFeatures();
    });
  } else {
    adminFeaturesReady = Promise.resolve(initAdminFeatures());
  }

  window.showModal = showModal;
  window.hideModal = hideModal;
  window.showNoticeForm = showNoticeForm;
  window.submitNotice = submitNotice;
  window.viewNotice = viewNotice;
  window.promptEditNotice = promptEditNotice;
  window.promptDeleteNotice = promptDeleteNotice;
  window.confirmDeleteNotice = confirmDeleteNotice;
  window.goNoticePage = goNoticePage;
  window.changeCalendarMonth = changeCalendarMonth;
  window.showDaySchedules = showDaySchedules;
  window.toggleEndDateGroup = toggleEndDateGroup;
  window.showScheduleForm = showScheduleForm;
  window.submitSchedule = submitSchedule;
  window.deleteSchedule = deleteSchedule;
  window.goUserPage = goUserPage;
  window.showUserForm = showUserForm;
  window.submitUser = submitUser;
  window.editUser = editUser;
  window.deleteUser = deleteUser;
  window.adminFeatures = {
    ready: adminFeaturesReady,
    renderNotices: renderNotices,
    renderCalendar: renderCalendar,
    renderUsers: renderUsers,
    loadNoticesFromStorage: loadNoticesFromStorage,
    loadUsersFromStorage: loadUsersFromStorage,
    getUsers: function () {
      return cloneData(usersData);
    },
    getDefaultUsers: function () {
      return cloneData(DEFAULT_USERS);
    }
  };
})();
