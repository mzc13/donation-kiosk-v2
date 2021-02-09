import dayjs from "dayjs";

let now = dayjs();
let firstDayOfNextMonth = dayjs()
  .month(now.get("month") + 4)
  .startOf("month");
// If the first day of the month is a Saturday(6), the first Friday(5 or 12) of that month occurs in the next week.
// You need to use .day(12) in this case because .day(5) will get the last Friday of the previous month.
let firstFridayOfNextMonth =
  firstDayOfNextMonth.day() == 6 ? firstDayOfNextMonth.day(12) : firstDayOfNextMonth.day(5);
// (async () => {
//   for (let i = 0; i < 10; i++) {
//     //   let firstDayOfNextMonth = dayjs().add(i, "month").startOf("month");
//     //   let firstFridayOfNextMonth =
//     //     firstDayOfNextMonth.day() == 6 ? firstDayOfNextMonth.day(12) : firstDayOfNextMonth.day(5);
//     //   firstFridayOfNextMonth = firstFridayOfNextMonth.add(3, "hour");
//     //   console.log(
//     //     `First Day: ${firstDayOfNextMonth.toString()} | First Friday: ${firstFridayOfNextMonth.toString()}`
//     //   );

//     await sleep(1000);
//     getFirstFridayOfNextMonth();
//   }
// })();
let firstFridayOfThisMonth =
  now.startOf("month").day() == 6 ? now.startOf("month").day(12) : now.startOf("month").day(5);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
/**
 * Returns the Unix timestamp(in seconds) corresponding to 3 AM on the first Friday of next month.
 */
function getFirstFridayOfNextMonth(now = dayjs()) {
  console.log(now.toString());
  let firstDayOfNextMonth = now.add(1, "month").startOf("month");
  let firstFridayOfNextMonth =
    firstDayOfNextMonth.day() == 6 ? firstDayOfNextMonth.day(12) : firstDayOfNextMonth.day(5);
  return firstFridayOfNextMonth.add(3, "hour").unix();
}
