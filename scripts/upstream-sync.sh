#!/usr/bin/env bash
# 원본에서 업데이트를 가져와 Pull Request 를 만든다 (배포판 S6).
#
# 왜 로직이 워크플로가 아니라 여기 있는가:
#   Vercel Deploy 버튼은 저장소를 복제할 때 **.github/ 폴더를 전달하지 못한다**.
#   GitHub 이 워크플로 파일 푸시에 별도 권한을 요구하기 때문이다(실측 확인).
#   그래서 교사가 워크플로 파일 하나를 직접 만들어야 하는데, 그 파일이 길면 부담이다.
#   로직을 이 스크립트로 빼면 워크플로는 10줄짜리 호출부만 남아 클릭 한 번으로 만들 수
#   있고, 이후 로직 수정은 일반 업데이트로 함께 실려 온다(다시 붙여넣을 일이 없다).
#
# 필요 환경: GH_TOKEN, 전체 이력이 있는 체크아웃(fetch-depth: 0)
set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-sehunYang/edu-note}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# 원본 저장소에서는 확인할 것이 없다(자기 자신을 비교하게 된다).
# 조용히 끝내지 않고 이유를 남긴다 — 회색 skip 만 보이면 왜 안 돌았는지 알 수 없다.
if [ "${GITHUB_REPOSITORY:-}" = "$UPSTREAM_REPO" ]; then
  echo "::notice::여기는 원본 저장소($UPSTREAM_REPO)입니다. 이 워크플로는 원본을 복제해 만든 '내 저장소'에서 실행해야 합니다."
  exit 0
fi
echo "확인 대상: ${GITHUB_REPOSITORY:-(알 수 없음)} (원본: $UPSTREAM_REPO)"

git remote add upstream "https://github.com/${UPSTREAM_REPO}.git" 2> /dev/null || true
git fetch --quiet upstream "$UPSTREAM_BRANCH"

BASE="$(git rev-parse HEAD)"
AHEAD="$(git rev-list --count "HEAD..upstream/${UPSTREAM_BRANCH}")"
echo "원본에 이 저장소에 없는 커밋: ${AHEAD}개"
if [ "$AHEAD" = "0" ]; then
  echo "이미 최신입니다. 만들 PR 이 없습니다."
  exit 0
fi

BRANCH="update/$(date +%Y%m%d-%H%M)"
git config user.name "edu-note-updater"
git config user.email "actions@github.com"
git checkout -B "$BRANCH"

# 원본과 공통 조상이 있는가?
# Vercel 이 만든 저장소는 원본을 '복사'한 것이라 git 이력을 물려받지 않을 수 있다.
# 그러면 일반 병합이 "refusing to merge unrelated histories" 로 무조건 실패한다.
if git merge-base HEAD "upstream/${UPSTREAM_BRANCH}" > /dev/null 2>&1; then
  MODE="merge"
else
  MODE="adopt"
fi
echo "모드: $MODE"
# 로그를 펼치지 않아도 보이도록 실행 요약에 남긴다.
{
  echo "### 업데이트 확인"
  echo ""
  echo "- 대상: \`${GITHUB_REPOSITORY}\`"
  echo "- 원본에 새 커밋: ${AHEAD}개"
  echo "- 병합 방식: \`${MODE}\` ($([ "$MODE" = "merge" ] && echo "이력 공유" || echo "이력 없음 — 내용 채택"))"
} >> "$GITHUB_STEP_SUMMARY"

if [ "$MODE" = "merge" ]; then
  if ! git merge --no-edit "upstream/${UPSTREAM_BRANCH}"; then
    git merge --abort || true
    echo "::warning::자동 병합이 충돌했습니다. 코드를 직접 고친 부분이 있으면 자연스러운 일입니다."
    BODY=issue-body.md
    echo "원본의 새 버전을 자동으로 합치려 했으나 충돌이 났습니다." > "$BODY"
    echo "코드를 직접 고친 부분이 있으면 자연스러운 일입니다." >> "$BODY"
    echo "" >> "$BODY"
    echo "도움이 필요하면 이 내용을 복사해 https://github.com/${UPSTREAM_REPO}/issues 에 남겨 주세요." >> "$BODY"
    gh issue create --title "업데이트 자동 병합 실패 (직접 수정한 부분과 충돌)" --body-file "$BODY" || true
    exit 0
  fi
else
  # 병합 기준점이 없으므로 원본 내용을 그대로 채택한다. 무엇이 바뀌는지는 PR diff 에
  # 그대로 보이고, 교사가 그걸 보고 머지를 결정한다(자동 머지하지 않는 이유이기도 하다).
  git read-tree --reset -u "upstream/${UPSTREAM_BRANCH}"
  if git diff --cached --quiet HEAD; then
    echo "내용이 이미 원본과 같습니다."
    exit 0
  fi
  git commit --quiet -m "Edu_Note 업데이트 ($(date +%Y-%m-%d))"
fi

# .github/ 는 동기화에서 제외한다.
#
# GITHUB_TOKEN 은 워크플로 파일을 만들거나 고칠 수 없다 — GitHub 보안 정책이고,
# workflow 의 permissions 로도 열 수 없다(개인 액세스 토큰이 필요하다). 그대로 밀면
# push 자체가 "refusing to allow a GitHub App to create or update workflow" 로 거부돼
# **업데이트 전체가 실패한다.** 원본의 워크플로가 한 글자만 달라져도 그렇게 된다.
#
# 그래서 원본 내용을 가져오되 .github/ 만 원래대로 되돌린다. 워크플로가 실제로
# 바뀌었으면 PR 본문에 "다시 켜 주세요" 안내를 넣는다(교사가 시스템 상태 화면에서
# 클릭 한 번으로 다시 만들 수 있다).
WORKFLOW_CHANGED=""
if ! git diff --quiet "$BASE" HEAD -- .github; then
  WORKFLOW_CHANGED="1"
  echo "::notice::원본의 자동화 파일(.github)이 바뀌었지만 이 업데이트에는 포함하지 않습니다. 앱의 세팅실 → 시스템 상태에서 다시 켜 주세요."
fi
if git cat-file -e "${BASE}:.github" > /dev/null 2>&1; then
  git checkout "$BASE" -- .github
else
  rm -rf .github
fi
git add -A
if ! git diff --cached --quiet HEAD; then
  git commit --quiet -m "자동화 파일(.github)은 동기화 대상에서 제외"
fi

# 이번 업데이트에 파괴적 마이그레이션이 있는가(러너와 같은 표기 규칙).
DESTRUCTIVE=""
for f in $(git diff --name-only --diff-filter=A "${BASE}..HEAD" -- 'lib/db/migrations/*.sql'); do
  if head -n 8 "$f" | grep -qi 'DESTRUCTIVE'; then
    DESTRUCTIVE="${DESTRUCTIVE}- $(basename "$f")|"
  fi
done

git push --force origin "$BRANCH"

BODY=pr-body.md
echo "새 버전이 나왔습니다. 아래 **Merge pull request** 를 누르면 반영됩니다." > "$BODY"
echo "" >> "$BODY"
echo "- 몇 분 뒤 Vercel 이 새 버전을 배포합니다." >> "$BODY"
echo "- 데이터베이스 변경이 있으면 배포 중에 자동으로 적용됩니다." >> "$BODY"
echo "- 기존 데이터는 그대로 유지됩니다." >> "$BODY"
echo "" >> "$BODY"
if [ -n "$DESTRUCTIVE" ]; then
  echo "## ⚠️ 데이터가 바뀌는 변경이 포함돼 있습니다" >> "$BODY"
  echo "" >> "$BODY"
  echo "$DESTRUCTIVE" | tr '|' '\n' >> "$BODY"
  echo "" >> "$BODY"
  echo "**머지 전에 세팅실 → 시스템 상태에서 백업을 내려받아 주세요.**" >> "$BODY"
  echo "" >> "$BODY"
fi
if [ -n "$WORKFLOW_CHANGED" ]; then
  echo "> ℹ️ 자동 업데이트 파일 자체가 새 버전으로 바뀌었습니다. 이 PR 에는 포함되지 않으니, 머지 후 앱의 **세팅실 → 시스템 상태 → 자동 업데이트 확인** 에서 한 번 더 켜 주세요." >> "$BODY"
  echo "" >> "$BODY"
fi
if [ "$MODE" = "adopt" ]; then
  echo "> 이 저장소는 원본의 git 이력을 물려받지 않아, 원본 내용을 그대로 가져오는 방식으로 업데이트합니다. 코드를 직접 고치신 적이 있다면 아래 diff 에서 그 부분이 되돌아가는지 확인해 주세요." >> "$BODY"
  echo "" >> "$BODY"
fi
echo "<sub>이 PR 은 주 1회 자동으로 만들어집니다. 자세한 내용은 docs/UPDATE.md 를 보세요.</sub>" >> "$BODY"

COMPARE="https://github.com/${GITHUB_REPOSITORY}/compare/${DEFAULT_BRANCH}...${BRANCH}?expand=1"

if gh pr create --title "Edu_Note 업데이트 ($(date +%Y-%m-%d))" --body-file "$BODY" --base "$DEFAULT_BRANCH" --head "$BRANCH"; then
  {
    echo "## ✅ 업데이트 요청을 만들었습니다"
    echo ""
    echo "저장소의 **Pull requests** 탭에서 내용을 확인하고 Merge 하세요."
  } >> "$GITHUB_STEP_SUMMARY"
else
  # PR 자동 생성은 저장소 설정 하나에 막힌다. 브랜치는 이미 올라가 있으므로,
  # 링크 한 번으로 직접 열 수 있게 해 준다(로그를 뒤지지 않도록 요약에도 적는다).
  echo "::warning::PR 을 자동으로 만들지 못했습니다. 아래 요약의 링크로 직접 여시거나, Settings → Actions → General 에서 'Allow GitHub Actions to create and approve pull requests' 를 켜 주세요."
  {
    echo "## 업데이트 준비 완료 — 마지막 한 걸음"
    echo ""
    echo "PR 을 자동으로 만들지 못했습니다. 아래 링크로 직접 열어 주세요."
    echo ""
    echo "### 👉 [업데이트 요청 열기]($COMPARE)"
    echo ""
    echo "다음부터 자동으로 만들어지게 하려면: 저장소 **Settings → Actions → General** →"
    echo "**Allow GitHub Actions to create and approve pull requests** 체크."
  } >> "$GITHUB_STEP_SUMMARY"
fi
