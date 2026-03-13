# 동국제강 원료기획팀 대시보드

첨부된 `xlsx`와 `pptx`를 분석해 만든 정적 웹 대시보드입니다. 디자인 톤은 참고 사이트 `raw-material-six.vercel.app`의 헤더, 탭, 카드, 표, 차트 스타일을 따라가고, 실제 지표는 원본 엑셀에서 재가공했습니다.

## 구성

- `login.html`: 테스트 계정 `dongkuk1 / 1234`
- `index.html`: 메인 대시보드
- `css/`: 참고 사이트와 동일한 스타일 토큰/레이아웃 계열
- `js/dashboard-data.js`: 엑셀에서 생성한 데이터 번들
- `scripts/build_dashboard_data.py`: 원본 `xlsx`를 다시 읽어 데이터 파일을 생성하는 스크립트

## 사용성 보강

- 모든 표는 헤더 클릭으로 오름차순/내림차순 정렬할 수 있습니다.
- `거래처관리` 탭은 거래처명 검색과 주력 등급 필터를 지원합니다.
- `favicon.svg`를 추가해 브라우저 기본 `favicon.ico` 404를 없앴습니다.

## 실행

```bash
cd /Users/jerry/raw-po-poc_codex
python3 -m http.server 8787 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8787/login.html`로 접속하면 됩니다.

## 데이터 재생성

```bash
cd /Users/jerry/raw-po-poc_codex
python3 scripts/build_dashboard_data.py
```

기본값은 전달받은 다운로드 경로의 원본 엑셀을 읽습니다. 다른 파일로 바꾸려면 `--source`, `--output` 옵션을 사용하면 됩니다.

## 참고

- 거래처 연락처/대표자/지역/수입계약 상세는 원본 엑셀에 없어 raw data 기반 파생 지표로 대체했습니다.
- 금액/수량 단위는 원본 파일 값을 그대로 사용합니다.
