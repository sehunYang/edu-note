/**
 * 컴시간 라이브 스모크 테스트 (네트워크 ON, 일회성 검증용).
 *   node scripts/comcigan-probe.mjs ["학교명"] ["교사명"]
 * 기본: 인천해송고등학교 / 양세훈.
 *
 * lib/integrations/comcigan.ts 와 동일한 프로토콜을 인라인으로 재현해, 실제 서버
 * 호출이 살아있는지(인천해송고 → 양세훈 시간표)까지 확인한다. 컴시간 구조가 바뀌면
 * 여기서 먼저 깨지므로 회귀 탐지에도 쓴다.
 */
import iconv from "iconv-lite";

const BASE = "http://comci.net:4082";
const SCHOOL = process.argv[2] || "인천해송고등학교";
const TEACHER = process.argv[3] || "양세훈";

const eucKrHex = (kw) => {
  let h = "";
  for (const b of iconv.encode(kw, "euc-kr")) h += "%" + b.toString(16);
  return h;
};
const slice = (s) => s.substr(0, s.lastIndexOf("}") + 1);
const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const allNumeric = (v, mg) => {
  for (let g = 1; g <= mg; g++) {
    const gd = v[g];
    if (!Array.isArray(gd)) continue;
    for (let c = 1; c < gd.length; c++) {
      const cd = gd[c];
      if (!Array.isArray(cd)) continue;
      for (let d = 1; d < cd.length; d++) {
        const day = cd[d];
        if (!Array.isArray(day)) continue;
        for (let p = 1; p < day.length; p++)
          if (typeof day[p] !== "number") return false;
      }
    }
  }
  return true;
};

async function body(url, eucDecode) {
  const buf = Buffer.from(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
  if (eucDecode) return iconv.decode(buf, "euc-kr");
  const u = buf.toString("utf8");
  try {
    JSON.parse(slice(u));
    return u;
  } catch {
    return iconv.decode(buf, "euc-kr");
  }
}

async function main() {
  // 1) init
  const init = await body(`${BASE}/st`, true);
  const i1 = init.indexOf("school_ra(sc)");
  const i2 = init.indexOf("sc_data('");
  const extractCode = init.substr(i1, 50).replace(" ", "").match(/url:'.(.*?)'/)[1];
  const scData = init
    .substr(i2, 30)
    .replace(" ", "")
    .match(/\(.*?\)/)[0]
    .replace(/[()]/g, "")
    .replace(/'/g, "")
    .split(",");
  console.log("✓ init  extractCode=%s scData=%j", extractCode, scData);

  // 2) search
  const sBody = await body(BASE + extractCode + eucKrHex(SCHOOL));
  const rows = JSON.parse(slice(sBody))["학교검색"];
  if (rows.length !== 1) throw new Error(`학교 검색 결과 ${rows.length}개`);
  const [, region, name, code] = rows[0];
  console.log("✓ search %s (%s) code=%d", name, region, code);

  // 3) timetable
  const ttUrl =
    BASE +
    extractCode.split("?")[0] +
    "?" +
    Buffer.from(scData[0] + code + "_0_" + scData[2]).toString("base64");
  const result = JSON.parse(slice(await body(ttUrl)));
  const classCount = result["학급수"] ?? [];
  // "전체학년" 은 플래그 배열일 수 있어 신뢰 불가 → 학급수 길이에서 학년 수 파생.
  const mg = Array.isArray(classCount) && classCount.length > 1 ? classCount.length - 1 : 3;
  const tc = Number(result["교사수"] ?? 0);

  let teachers, subjects, tt;
  for (const k of Object.keys(result)) {
    if (k.indexOf("자료") === -1) continue;
    const v = result[k];
    if (!Array.isArray(v)) continue;
    if (!teachers && isStrArr(v) && Math.abs(v.length - (tc + 1)) <= 1) teachers = v;
    else if (!subjects && typeof v[0] === "number" && typeof v[1] === "string") subjects = v;
    else if (!tt && v.length === mg + 1 && v[0] === mg && Array.isArray(v[1]) && allNumeric(v, mg)) tt = v;
  }
  console.log("✓ decode 교사 %d명 · 과목 %d개 · 학급수 %j", teachers.length - 1, subjects[0], classCount);

  const tIdx = teachers.findIndex(
    (t) => typeof t === "string" && t.replace(/\*+$/, "").length > 0 &&
      TEACHER.startsWith(t.replace(/\*+$/, "")) && TEACHER.length === t.length,
  );
  if (tIdx < 0) throw new Error(`'${TEACHER}' 교사 미발견`);

  const wd = ["", "월", "화", "수", "목", "금"];
  const mine = [];
  for (let g = 1; g <= mg; g++)
    for (let c = 1; c <= (classCount[g] || 0); c++)
      for (let d = 1; d <= 5; d++) {
        const day = tt[g]?.[c]?.[d];
        if (!Array.isArray(day)) continue;
        for (let p = 1; p <= day[0]; p++) {
          const code2 = day[p];
          if (typeof code2 === "number" && Math.floor(code2 / 1000) === tIdx)
            mine.push(`${g}-${c} ${wd[d]}${p}교시 ${subjects[code2 % 1000]?.replace(/_/g, "")}`);
        }
      }
  console.log(`\n=== ${TEACHER}(${teachers[tIdx]}) 시간표: ${mine.length}개 수업 ===`);
  mine.forEach((m) => console.log("  " + m));
  console.log("\n✅ 라이브 호출 성공");
}

main().catch((e) => {
  console.error("❌ PROBE FAILED:", e.message);
  process.exit(1);
});
