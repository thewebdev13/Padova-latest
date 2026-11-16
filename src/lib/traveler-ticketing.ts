export type Ticketing = { dob: string; sex: string; nationality: string };
export function ticketingValues(record?: Record<string, any> | null): Ticketing {
  return {
    dob: record?.dob?.slice(0, 10) ?? '',
    sex: record?.preferences?.sex ?? '',
    nationality: record?.preferences?.nationality ?? '',
  };
}
export function ageAtTravel(dob: string, travelDate: string): number | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(travelDate) ||
    dob > travelDate
  )
    return null;
  const age =
    Number(travelDate.slice(0, 4)) -
    Number(dob.slice(0, 4)) -
    Number(travelDate.slice(5) < dob.slice(5));
  return Number.isFinite(age) ? age : null;
}
// ISO country names from the browser/runtime, with stable codes for the shared list.
export const countryNames =
  'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'
    .split(' ')
    .map((code) => new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code)
    .sort();
