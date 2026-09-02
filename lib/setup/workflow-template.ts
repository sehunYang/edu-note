import "server-only";

/**
 * 업데이트 확인 워크플로의 내용 (배포판 S6).
 *
 * 왜 앱 안에 문자열로 들고 있는가: Vercel Deploy 버튼은 저장소를 복제할 때
 * **.github/ 폴더를 전달하지 못한다**(GitHub 이 워크플로 파일 푸시에 별도 권한을
 * 요구한다 — 실측 확인). 그래서 교사의 저장소에는 이 파일이 없고, 디스크에서 읽을 수
 * 없다. 시스템 상태 화면이 "클릭 한 번으로 만들기" 링크를 만들려면 내용이 필요하므로
 * 여기에 둔다.
 *
 * 실제 로직은 scripts/upstream-sync.sh 에 있다(그 폴더는 정상 전달된다). 그래서 이
 * 워크플로는 호출부만 남아 짧고, 로직이 바뀌어도 교사가 이 파일을 다시 만들 필요가 없다.
 *
 * ⚠ .github/workflows/upstream-sync.yml 과 **글자 단위로 같아야 한다.**
 *    어긋나면 scripts/workflows.test.mjs 가 실패한다.
 */
export const UPSTREAM_SYNC_WORKFLOW_PATH = ".github/workflows/upstream-sync.yml";

export const UPSTREAM_SYNC_WORKFLOW = "name: 업데이트 확인\n\non:\n  schedule:\n    - cron: \"0 0 * * 1\"\n  workflow_dispatch:\n\npermissions:\n  contents: write\n  pull-requests: write\n\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - run: bash scripts/upstream-sync.sh\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}\n";
