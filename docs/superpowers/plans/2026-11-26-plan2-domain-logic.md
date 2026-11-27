# 계획 2: 도메인 로직 (src/lib/domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주행거리 추정, 정비 규칙 엔진, 보정 제안, 계절, 알림 후보 계산을 **DB·네트워크·현재 시각에 의존하지 않는 순수 함수**로 만들고, 설계 문서의 수치를 그대로 단위 테스트로 고정한다.

**Architecture:** `src/lib/domain/` 아래 파일당 한 가지 책임. 모든 함수는 오늘 날짜(`IsoDate`, KST 기준 `YYYY-MM-DD`)를 인자로 받는다. 규칙·정비 항목·계절 데이터는 `seed/` 아래 TypeScript 상수로 두고, 계획 3에서 이 상수로 D1 시드를 만든다. 리뷰어가 가장 먼저 읽을 코드이므로 외부 라이브러리 없이 작성한다.

**Tech Stack:** TypeScript strict · Vitest (Node 환경)

**Spec:** `docs/superpowers/specs/2026-11-26-car-care-design.md` (기능 다·라·마·아·자·차, 6장 규칙, 7장 계산 로직, 9.4 dedupe_key, 10.2 일일 작업)

## 이 계획의 범위와 순서
계획 1의 런타임 결정과 무관하므로 **계획 1과 병행 가능**하다. 계획 1 Task 1(Vitest 설치) 이후에 시작하거나, 먼저 시작한다면 `npm i -D vitest typescript` 후 `vitest.config.ts` 없이 `npx vitest run src/lib/domain`으로 돌린다. 화면, DB 저장, 알림 문구·발송은 계획 3·4에서 이 함수들을 호출한다.

## Global Constraints
- 화면의 시각 디자인은 사용자의 Figma 디자인이 오면 적용한다. 그 전까지 화면은 기능 우선 기본 화면(토큰 기반 최소 스타일)으로 두고, 디자인을 임의로 정하지 않는다 (CLAUDE.md "디자인 (Figma)").
- `src/lib/domain/**`는 `Date.now()`, `new Date()`(인자 없이), `fetch`, DB, 환경 변수를 쓰지 않는다. 현재 시각은 `toKstDate(now)`로 바꿔 인자로 넘긴다.
- 날짜 타입은 `IsoDate = string` (`YYYY-MM-DD`, KST). 시각 타입은 ISO 문자열(UTC).
- 연료 타입 값: `"GASOLINE" | "DIESEL" | "LPG" | "HYBRID" | "EV"`.
- 일 평균 유효 범위 1~500(정수). 월↔일 환산 계수 30.4.
- 상태 임계값: 곧 교체 = 남은 거리 ≤ max(주기 km의 10%, 500km) 또는 남은 기간 ≤ 30일. 교체 필요 = 남은 거리 ≤ 0 또는 남은 기간 ≤ 0일. 거리·기간 중 더 나쁜 상태를 택한다.
- 기록이 없는 항목의 가정 기준점: 연식의 1월 1일, 0km. 기간 주기만 있는 항목은 `UNKNOWN`.
- 보정: 기준 실측 = 최신 실측으로부터 180일 이내 중 가장 오래된 것, 간격 14일 이상, 차이 20% 이상.
- OVERDUE 재알림: 직전 OVERDUE 알림으로부터 14일 이상, 주기당 총 3회.
- 계절: 봄 3~5월, 여름 6~8월, 가을 9~10월, 겨울 11~2월(시즌 키는 시작 연도, 예: 2027-01 → `2026-WINTER`).
- 도메인 테스트 커버리지 90% 이상 (`vitest run --coverage src/lib/domain`).

## Review Focus
- 실측·기록 배열이 날짜순이 아니거나 같은 날짜가 여러 개 → 최신은 "날짜가 가장 늦고, 같으면 km가 가장 큰 것"으로 항상 같게 골라야 한다. (Task 2, 3 테스트)
- 월말 날짜에 개월 더하기 → 2026-01-31 + 1개월 = 2026-02-28, 2028-02-29 + 12개월 = 2029-02-28. (Task 1 테스트)
- KST 자정 경계 → `2026-11-25T15:30:00Z`는 `2026-11-26`, `2026-11-25T14:59:59Z`는 `2026-11-25`. (Task 1 테스트)
- 오늘이 마지막 실측일보다 이른 경우(시계·시간대 차이) → 추정 주행거리는 마지막 실측 km보다 작아지지 않는다. (Task 2 테스트)
- 연료에 맞지 않는 항목의 기록(전기차에 엔진오일 기록) → 결과에 그 항목이 나타나지 않는다. (Task 4 테스트)

---

### Task 1: 공통 타입과 KST 날짜 유틸

**Files:**
- Create: `src/lib/domain/types.ts`, `src/lib/domain/dates.ts`, `src/lib/domain/__tests__/dates.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type IsoDate = string;
export type FuelType = "GASOLINE" | "DIESEL" | "LPG" | "HYBRID" | "EV";
export const FUEL_TYPES: readonly FuelType[];
export interface Reading { id: string; date: IsoDate; km: number }
export interface RecordEntry { id: string; itemCode: string; date: IsoDate; km: number }
export interface Rule { itemCode: string; fuelType: FuelType; vehicleModelId: string | null; intervalKm: number | null; intervalMonths: number | null }
export type ItemStatus = "OK" | "DUE_SOON" | "OVERDUE" | "UNKNOWN";
export interface VehicleInput { modelYear: number; fuelType: FuelType; vehicleModelId: string | null; dailyKm: number; readings: Reading[]; records: RecordEntry[] }
export interface ItemResult {
  itemCode: string;
  status: ItemStatus;
  basis: "RECORD" | "GUESS" | "NONE";
  cycleKey: string | null;            // 기록 id, "guess-{n}", UNKNOWN이면 null
  lastDoneKm: number | null; lastDoneDate: IsoDate | null;
  nextDueKm: number | null; nextDueDate: IsoDate | null;
  remainingKm: number | null; remainingDays: number | null;
  expectedDate: IsoDate | null; expectedBy: "DISTANCE" | "PERIOD" | null;
  progress: number;                   // 0 이상, 1 = 주기 도달 (화면은 min(1, x)로 표시)
}
```
- Produces (`dates.ts`): `toKstDate(now: Date): IsoDate`, `addDays(d: IsoDate, n: number): IsoDate`, `addMonths(d: IsoDate, n: number): IsoDate`, `daysBetween(from: IsoDate, to: IsoDate): number` (to − from, 일 단위 정수)

- [ ] **Step 1: 실패하는 테스트** (`dates.test.ts`)
```ts
expect(toKstDate(new Date("2026-11-25T15:30:00Z"))).toBe("2026-11-26");
expect(toKstDate(new Date("2026-11-25T14:59:59Z"))).toBe("2026-11-25");
expect(addDays("2026-11-26", 17)).toBe("2026-12-13");
expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
expect(addMonths("2025-12-01", 12)).toBe("2026-12-01");
expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
expect(daysBetween("2026-11-01", "2026-11-26")).toBe(25);
expect(daysBetween("2026-12-01", "2026-11-26")).toBe(-5);
```
Run: `npx vitest run src/lib/domain` → FAIL

- [ ] **Step 2: 구현** — UTC 기준 `Date.UTC`로만 계산(로컬 시간대 의존 금지). `toKstDate`는 `now.getTime() + 9h` 후 UTC 날짜 부분. `addMonths`는 결과 달의 마지막 날로 일(day)을 자른다.

- [ ] **Step 3: 통과 확인** — Run: `npx vitest run src/lib/domain` → PASS

- [ ] **Step 4: Commit** — `git add src/lib/domain && git commit -m "feat(domain): add shared types and KST date utils"`

---

### Task 2: 주행거리 — 추정, 계산기, 실측 검증

**Files:**
- Create: `src/lib/domain/odometer.ts`, `src/lib/domain/__tests__/odometer.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `latestReading(readings: Reading[]): Reading | null`
  - `estimateOdometer(readings: Reading[], dailyKm: number, today: IsoDate): number` — 실측이 없으면 `Error`
  - `dailyKmFromCalculator(i: { commuteOneWayKm: number; commuteDaysPerWeek: number; weekendTotalKm: number }): number`
  - `monthlyFromDaily(daily: number): number`, `dailyFromMonthly(monthly: number): number`
  - `isValidDailyKm(n: number): boolean`
  - `checkNewReading(existing: Reading[], next: { date: IsoDate; km: number }): "OK" | "DECREASING"`

- [ ] **Step 1: 실패하는 테스트**
```ts
const r = (id: string, date: string, km: number) => ({ id, date, km });
expect(latestReading([r("a","2026-11-01",42000), r("b","2026-10-01",41000)])?.id).toBe("a");
expect(latestReading([r("a","2026-11-01",42000), r("b","2026-11-01",42100)])?.id).toBe("b"); // 같은 날 → km 큰 것
expect(estimateOdometer([r("a","2026-11-01",42000)], 31, "2026-11-26")).toBe(42775);   // 설계 7.5
expect(estimateOdometer([r("a","2026-11-27",42000)], 31, "2026-11-26")).toBe(42000);   // 오늘 < 실측일
expect(() => estimateOdometer([], 31, "2026-11-26")).toThrow();
expect(dailyKmFromCalculator({ commuteOneWayKm: 18, commuteDaysPerWeek: 5, weekendTotalKm: 40 })).toBe(31); // (180+40)/7=31.4
expect(monthlyFromDaily(31)).toBe(942);
expect(dailyFromMonthly(940)).toBe(31);
expect([0, 1, 500, 501, 30.5].map(isValidDailyKm)).toEqual([false, true, true, false, false]);
const ex = [r("a","2026-10-01",41000), r("b","2026-11-01",42000)];
expect(checkNewReading(ex, { date: "2026-11-20", km: 42500 })).toBe("OK");
expect(checkNewReading(ex, { date: "2026-11-20", km: 41900 })).toBe("DECREASING"); // 이전보다 작음
expect(checkNewReading(ex, { date: "2026-10-15", km: 42100 })).toBe("DECREASING"); // 이후 실측보다 큼
expect(checkNewReading(ex, { date: "2026-10-15", km: 41500 })).toBe("OK");        // 사이에 끼는 값
```
Run → FAIL

- [ ] **Step 2: 구현** — 추정은 `latest.km + dailyKm * max(0, daysBetween(latest.date, today))`. 계산기·환산은 `Math.round`. `checkNewReading`: 날짜가 같거나 이른 실측 중 km가 새 값보다 큰 것이 있거나, 날짜가 늦은 실측 중 km가 새 값보다 작은 것이 있으면 `DECREASING`.

- [ ] **Step 3: 통과 확인** → PASS

- [ ] **Step 4: Commit** — `git commit -am "feat(domain): add odometer estimation and validation"` (새 파일은 `git add` 먼저)

---

### Task 3: 규칙·항목·계절 시드 상수

**Files:**
- Create: `src/server/db/seeds/maintenance.ts`, `src/server/db/seeds/__tests__/maintenance.test.ts`

**Interfaces:**
- Consumes: Task 1 `Rule`, `FuelType`
- Produces:
  - `MAINTENANCE_ITEMS: { code: string; name: string; description: string; mapKeyword: string | null; shopKeyword: string | null; sortOrder: number }[]`
  - `MAINTENANCE_RULES: Rule[]` (모두 `vehicleModelId: null`)
  - `SEASONAL_ITEMS: { id: string; season: "SPRING" | "SUMMER" | "FALL" | "WINTER"; label: string; excludedFuelTypes: FuelType[]; sortOrder: number }[]`

값은 설계 6.2·6.3 표를 그대로 옮긴다. "전체"는 연료 5종 각각 한 행. 예외: `TIRE_REPLACE`의 EV 행은 40,000km/60개월, `BRAKE_PAD`의 EV·HYBRID 행은 30,000km. 항목 설명(`description`)은 한 문장(무엇이고 왜 교체하는지). 계절 항목은 6.3의 쉼표로 나뉜 각 점검을 한 행으로(예: 여름 "냉각수 점검"은 `excludedFuelTypes: ["EV"]`, 겨울 "부동액 농도"도 `["EV"]`).

- [ ] **Step 1: 실패하는 테스트**
```ts
const rule = (code: string, fuel: FuelType) => MAINTENANCE_RULES.find(r => r.itemCode === code && r.fuelType === fuel);
expect(rule("ENGINE_OIL", "EV")).toBeUndefined();
expect(rule("ENGINE_OIL", "GASOLINE")).toMatchObject({ intervalKm: 10000, intervalMonths: 12 });
expect(rule("TIRE_REPLACE", "EV")).toMatchObject({ intervalKm: 40000, intervalMonths: 60 });
expect(rule("BRAKE_PAD", "HYBRID")).toMatchObject({ intervalKm: 30000, intervalMonths: null });
expect(rule("FUEL_FILTER", "GASOLINE")).toBeUndefined();
expect(rule("REDUCER_OIL", "EV")).toMatchObject({ intervalKm: 120000 });
expect(MAINTENANCE_RULES.every(r => r.intervalKm !== null || r.intervalMonths !== null)).toBe(true);
expect(new Set(MAINTENANCE_RULES.map(r => `${r.itemCode}:${r.fuelType}`)).size).toBe(MAINTENANCE_RULES.length);
expect(MAINTENANCE_RULES.every(r => MAINTENANCE_ITEMS.some(i => i.code === r.itemCode))).toBe(true);
expect(MAINTENANCE_ITEMS).toHaveLength(15);
```
Run → FAIL

- [ ] **Step 2: 구현** — 6.2·6.3 표 그대로.

- [ ] **Step 3: 통과 확인** → PASS

- [ ] **Step 4: Commit** — `git add src/server/db/seeds && git commit -m "feat(seed): add maintenance rules, items and seasonal checklist"`

---

### Task 4: 정비 규칙 엔진

**Files:**
- Create: `src/lib/domain/rules.ts`, `src/lib/domain/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 `estimateOdometer`, `latestReading`; 테스트에서 Task 3 `MAINTENANCE_RULES`
- Produces:
  - `applicableRules(rules: Rule[], fuel: FuelType, vehicleModelId: string | null): Rule[]` — 항목마다 차종 지정 행이 일반 행보다 우선
  - `evaluateVehicle(input: VehicleInput, rules: Rule[], today: IsoDate): ItemResult[]` — 적용 규칙 순서대로, 연료에 해당하지 않는 항목의 기록은 무시

계산 (설계 7.2~7.4):
- 기록 있음(`basis: "RECORD"`): 그 항목의 최신 기록(날짜 → km 순). `nextDueKm = km + intervalKm`, `nextDueDate = addMonths(date, intervalMonths)`, `cycleKey = 기록 id`.
- 기록 없음 + 거리 주기 있음(`"GUESS"`): `n = floor(est / intervalKm)`, `lastDoneKm = n * intervalKm`, `nextDueKm = (n+1) * intervalKm`, `cycleKey = "guess-" + n`. 기간 주기도 있으면 기점 `${modelYear}-01-01`에서 주기 배수 중 today 이하의 마지막 날을 `lastDoneDate`, 그다음 배수를 `nextDueDate`.
- 기록 없음 + 기간 주기만(`"NONE"`): `status: "UNKNOWN"`, `cycleKey: null`, 수치 필드 null, `progress: 0`.
- `remainingKm = nextDueKm − est`, `remainingDays = daysBetween(today, nextDueDate)`.
- 상태: 거리·기간 각각 판정 후 나쁜 쪽(`OVERDUE > DUE_SOON > OK`). 곧 교체 거리 임계값 `max(round(intervalKm * 0.1), 500)`.
- 예상일: 거리 `addDays(today, ceil(remainingKm / dailyKm))`, 기간 `nextDueDate`, 둘 중 이른 날과 그 기준. 하나만 있으면 그것.
- `progress = max((est − lastDoneKm) / intervalKm, daysBetween(lastDoneDate, today) / daysBetween(lastDoneDate, nextDueDate))` (해당 주기 없는 쪽은 제외).
- `dailyKm`이 `isValidDailyKm`을 통과하지 않으면 `Error`.

- [ ] **Step 1: 실패하는 테스트**
```ts
const base = { modelYear: 2021, fuelType: "GASOLINE" as const, vehicleModelId: null, dailyKm: 31,
  readings: [{ id: "r1", date: "2026-11-01", km: 42000 }], records: [] as RecordEntry[] };
const get = (res: ItemResult[], code: string) => res.find(x => x.itemCode === code)!;

// 설계 7.5 예시
const withOil = { ...base, records: [{ id: "m1", itemCode: "ENGINE_OIL", date: "2025-12-01", km: 33300 }] };
expect(get(evaluateVehicle(withOil, MAINTENANCE_RULES, "2026-11-26"), "ENGINE_OIL")).toMatchObject({
  basis: "RECORD", cycleKey: "m1", nextDueKm: 43300, nextDueDate: "2026-12-01",
  remainingKm: 525, remainingDays: 5, expectedDate: "2026-12-01", expectedBy: "PERIOD", status: "DUE_SOON" });

// 추정 기준(7.3): 42,775km → 다음 50,000km, guess-4, 교체 필요가 되지 않음
expect(get(evaluateVehicle(base, MAINTENANCE_RULES, "2026-11-26"), "ENGINE_OIL")).toMatchObject({
  basis: "GUESS", cycleKey: "guess-4", lastDoneKm: 40000, nextDueKm: 50000 });
expect(evaluateVehicle(base, MAINTENANCE_RULES, "2026-11-26").some(x => x.basis === "GUESS" && x.status === "OVERDUE")).toBe(false);

// 기간 주기만 있는 항목은 UNKNOWN
expect(get(evaluateVehicle(base, MAINTENANCE_RULES, "2026-11-26"), "BATTERY_12V")).toMatchObject({ status: "UNKNOWN", basis: "NONE", cycleKey: null });

// 경계값
const brake = (date: string, km: number) => ({ ...base, records: [{ id: "b1", itemCode: "BRAKE_FLUID", date, km }] });
expect(get(evaluateVehicle(brake("2024-11-26", 30000), MAINTENANCE_RULES, "2026-11-26"), "BRAKE_FLUID").status).toBe("OVERDUE"); // 남은 기간 0일
expect(get(evaluateVehicle(brake("2024-12-26", 30000), MAINTENANCE_RULES, "2026-11-26"), "BRAKE_FLUID").status).toBe("DUE_SOON"); // 30일
expect(get(evaluateVehicle(brake("2025-06-01", 6775), MAINTENANCE_RULES, "2026-11-26"), "BRAKE_FLUID").status).toBe("DUE_SOON");  // 46,775 − 42,775 = 4,000km = 10%
expect(get(evaluateVehicle(brake("2025-06-01", 2775), MAINTENANCE_RULES, "2026-11-26"), "BRAKE_FLUID").status).toBe("OVERDUE");  // 남은 0km

// 전기차: 엔진오일 없음, 기록이 있어도 무시
const ev = { ...base, fuelType: "EV" as const, records: [{ id: "x", itemCode: "ENGINE_OIL", date: "2026-01-01", km: 40000 }] };
expect(evaluateVehicle(ev, MAINTENANCE_RULES, "2026-11-26").map(x => x.itemCode)).not.toContain("ENGINE_OIL");

// 차종 지정 규칙 우선
const custom = [...MAINTENANCE_RULES, { itemCode: "ENGINE_OIL", fuelType: "GASOLINE" as const, vehicleModelId: "m-avante", intervalKm: 15000, intervalMonths: 12 }];
expect(applicableRules(custom, "GASOLINE", "m-avante").find(r => r.itemCode === "ENGINE_OIL")?.intervalKm).toBe(15000);
expect(applicableRules(custom, "GASOLINE", null).find(r => r.itemCode === "ENGINE_OIL")?.intervalKm).toBe(10000);
```
Run → FAIL

- [ ] **Step 2: 구현** — 위 계산 규칙대로.

- [ ] **Step 3: 통과 확인** → PASS

- [ ] **Step 4: Commit** — `git add src/lib/domain && git commit -m "feat(domain): add maintenance rule engine"`

---

### Task 5: 보정 제안과 계절

**Files:**
- Create: `src/lib/domain/calibration.ts`, `src/lib/domain/season.ts`, `src/lib/domain/__tests__/calibration.test.ts`, `src/lib/domain/__tests__/season.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 `latestReading`; 테스트에서 Task 3 `SEASONAL_ITEMS`
- Produces:
  - `calibrationSuggestion(readings: Reading[], dailyKm: number, dismissedAtReadingId: string | null): { actualDailyKm: number; fromReadingId: string; toReadingId: string } | null`
  - `type Season = "SPRING" | "SUMMER" | "FALL" | "WINTER"`
  - `seasonOf(date: IsoDate): { season: Season; seasonKey: string }`
  - `isSeasonStartMonth(date: IsoDate): boolean` — 3·6·9·11월
  - `seasonalItemsFor<T extends { season: Season; excludedFuelTypes: FuelType[] }>(items: T[], season: Season, fuel: FuelType): T[]`

- [ ] **Step 1: 실패하는 테스트**
```ts
const r = (id: string, date: string, km: number) => ({ id, date, km });
// 설정 31, 실제 (42532-42000)/14 = 38 → 차이 22.6% → 제안
expect(calibrationSuggestion([r("a","2026-11-01",42000), r("b","2026-11-15",42532)], 31, null))
  .toEqual({ actualDailyKm: 38, fromReadingId: "a", toReadingId: "b" });
expect(calibrationSuggestion([r("a","2026-11-01",42000), r("b","2026-11-14",42500)], 31, null)).toBeNull();   // 13일
expect(calibrationSuggestion([r("a","2026-11-01",42000), r("b","2026-11-15",42500)], 31, null)).toBeNull();   // 35.7 → 36, 차이 16%
expect(calibrationSuggestion([r("a","2026-11-01",42000), r("b","2026-11-15",42532)], 31, "b")).toBeNull();    // 그대로 두기
expect(calibrationSuggestion([r("a","2026-11-01",42000)], 31, null)).toBeNull();
// 180일보다 오래된 실측은 기준에서 제외: old는 무시되고 mid→new 사용
expect(calibrationSuggestion([r("old","2026-01-01",30000), r("mid","2026-06-01",36000), r("new","2026-11-01",42000)], 20, null)?.fromReadingId).toBe("mid");

expect(seasonOf("2026-11-26")).toEqual({ season: "WINTER", seasonKey: "2026-WINTER" });
expect(seasonOf("2027-01-10")).toEqual({ season: "WINTER", seasonKey: "2026-WINTER" });
expect(seasonOf("2027-02-28").seasonKey).toBe("2026-WINTER");
expect(seasonOf("2027-03-01")).toEqual({ season: "SPRING", seasonKey: "2027-SPRING" });
expect(seasonOf("2026-10-31").season).toBe("FALL");
expect(["2026-03-15","2026-06-01","2026-09-30","2026-11-02","2026-12-01"].map(isSeasonStartMonth)).toEqual([true,true,true,true,false]);
expect(seasonalItemsFor(SEASONAL_ITEMS, "WINTER", "EV").some(i => i.label.includes("부동액"))).toBe(false);
expect(seasonalItemsFor(SEASONAL_ITEMS, "WINTER", "GASOLINE").some(i => i.label.includes("부동액"))).toBe(true);
```
Run → FAIL

- [ ] **Step 2: 구현** — 보정: 최신 실측 `rn` = `latestReading`; 기준 `r0` = `daysBetween(x.date, rn.date) <= 180`인 것 중 날짜가 가장 이른 것; `days = daysBetween(r0.date, rn.date)`가 14 미만이거나 `r0 === rn`이면 null; `actual = Math.round((rn.km − r0.km) / days)`; `|actual − dailyKm| / dailyKm >= 0.2`일 때만 반환.

- [ ] **Step 3: 통과 확인** → PASS

- [ ] **Step 4: Commit** — `git add src/lib/domain && git commit -m "feat(domain): add calibration suggestion and seasons"`

---

### Task 6: 알림 후보 계산

**Files:**
- Create: `src/lib/domain/alerts.ts`, `src/lib/domain/__tests__/alerts.test.ts`

**Interfaces:**
- Consumes: Task 1 `ItemResult`, `toKstDate`, `daysBetween`; Task 5 `isSeasonStartMonth`, `seasonOf`
- Produces:
```ts
export type AlertType = "DUE_SOON" | "OVERDUE" | "SEASONAL";
export interface PriorNotification { dedupeKey: string; createdAt: string }   // createdAt: ISO(UTC)
export interface AlertPrefs { dueSoon: boolean; overdue: boolean; seasonal: boolean; allOff: boolean }
export interface AlertCandidate { type: AlertType; itemCode: string | null; dedupeKey: string; guessed: boolean }
export function alertCandidates(a: { vehicleId: string; results: ItemResult[]; prior: PriorNotification[]; prefs: AlertPrefs; today: IsoDate }): AlertCandidate[];
```
규칙 (설계 기능 차, 9.4, 10.2):
- `prefs.allOff` → 빈 배열. 종류별 끄기 존중.
- `DUE_SOON`: 키 `DUE_SOON:{vehicleId}:{itemCode}:{cycleKey}`가 prior에 없으면 후보. `guessed = basis === "GUESS"`.
- `OVERDUE`(`basis === "RECORD"`만): prior 중 접두사 `OVERDUE:{vehicleId}:{itemCode}:{cycleKey}:`인 것의 수 `k`. `k === 0` → 키 끝 `:0`. `0 < k < 3`이고 그중 가장 최근 `createdAt`의 KST 날짜로부터 `today`까지 14일 이상 → 키 끝 `:{k}`. 그 외 없음.
- `SEASONAL`: `isSeasonStartMonth(today)`이고 키 `SEASONAL:{vehicleId}:{seasonKey}`가 prior에 없으면 후보(`itemCode: null`).
- 반환 순서: `results` 순서대로 항목 후보, 마지막에 `SEASONAL`.
- 데모 사용자 제외와 DB INSERT·발송은 계획 4의 일일 작업이 한다.

- [ ] **Step 1: 실패하는 테스트**
```ts
const prefs = { dueSoon: true, overdue: true, seasonal: true, allOff: false };
const item = (o: Partial<ItemResult>): ItemResult => ({ itemCode: "ENGINE_OIL", status: "OK", basis: "RECORD", cycleKey: "m1",
  lastDoneKm: null, lastDoneDate: null, nextDueKm: null, nextDueDate: null, remainingKm: null, remainingDays: null,
  expectedDate: null, expectedBy: null, progress: 0, ...o });
const run = (results: ItemResult[], prior: PriorNotification[] = [], today = "2026-11-26", p = prefs) =>
  alertCandidates({ vehicleId: "v1", results, prior, prefs: p, today });

expect(run([item({ status: "DUE_SOON" })]).map(c => c.dedupeKey)).toContain("DUE_SOON:v1:ENGINE_OIL:m1");
expect(run([item({ status: "DUE_SOON" })], [{ dedupeKey: "DUE_SOON:v1:ENGINE_OIL:m1", createdAt: "2026-11-20T00:00:00Z" }])
  .filter(c => c.type === "DUE_SOON")).toHaveLength(0);
expect(run([item({ status: "DUE_SOON", basis: "GUESS", cycleKey: "guess-4" })]).find(c => c.type === "DUE_SOON")).toMatchObject({ dedupeKey: "DUE_SOON:v1:ENGINE_OIL:guess-4", guessed: true });
expect(run([item({ status: "OVERDUE", basis: "GUESS", cycleKey: "guess-4" })]).filter(c => c.type === "OVERDUE")).toHaveLength(0);

const od = item({ status: "OVERDUE" });
const p0 = { dedupeKey: "OVERDUE:v1:ENGINE_OIL:m1:0", createdAt: "2026-11-01T00:00:00Z" };
expect(run([od]).find(c => c.type === "OVERDUE")?.dedupeKey).toBe("OVERDUE:v1:ENGINE_OIL:m1:0");
expect(run([od], [p0], "2026-11-14").filter(c => c.type === "OVERDUE")).toHaveLength(0);          // 13일
expect(run([od], [p0], "2026-11-15").find(c => c.type === "OVERDUE")?.dedupeKey).toBe("OVERDUE:v1:ENGINE_OIL:m1:1");
const p1 = { dedupeKey: "OVERDUE:v1:ENGINE_OIL:m1:1", createdAt: "2026-11-15T00:00:00Z" };
const p2 = { dedupeKey: "OVERDUE:v1:ENGINE_OIL:m1:2", createdAt: "2026-11-29T00:00:00Z" };
expect(run([od], [p0, p1, p2], "2027-01-30").filter(c => c.type === "OVERDUE")).toHaveLength(0);   // 총 3회 끝
expect(run([item({ status: "OVERDUE", cycleKey: "m2" })], [p0, p1, p2]).find(c => c.type === "OVERDUE")?.dedupeKey)
  .toBe("OVERDUE:v1:ENGINE_OIL:m2:0");                                                                // 새 정비 기록 → 새 주기

expect(run([], [], "2026-11-26").find(c => c.type === "SEASONAL")?.dedupeKey).toBe("SEASONAL:v1:2026-WINTER");
expect(run([], [{ dedupeKey: "SEASONAL:v1:2026-WINTER", createdAt: "2026-11-01T00:00:00Z" }], "2026-11-26")).toHaveLength(0);
expect(run([], [], "2026-12-01")).toHaveLength(0);
expect(run([item({ status: "DUE_SOON" })], [], "2026-11-26", { ...prefs, allOff: true })).toHaveLength(0);
expect(run([item({ status: "DUE_SOON" })], [], "2026-12-01", { ...prefs, dueSoon: false })).toHaveLength(0);
```
Run → FAIL

- [ ] **Step 2: 구현** — 위 규칙대로.

- [ ] **Step 3: 전체 도메인 테스트와 커버리지**

Run: `npm i -D @vitest/coverage-v8 && npx vitest run --coverage src/lib/domain src/server/db/seeds` → 모두 PASS, `src/lib/domain` 구문 커버리지 90% 이상.

- [ ] **Step 4: Commit** — `git add src/lib/domain package.json package-lock.json && git commit -m "feat(domain): add alert candidate computation"`
