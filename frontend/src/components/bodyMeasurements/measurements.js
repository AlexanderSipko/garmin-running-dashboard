export const measurements = [
  ["weight", "Вес", "кг", "На одних и тех же весах, по возможности утром."],
  ["neck", "Шея", "см", "Вокруг шеи, чуть ниже выступа гортани."],
  ["shoulders", "Обхват плеч", "см", "Обведи ленту вокруг плечевого пояса по самым выступающим точкам плеч. Руки расслаблены и опущены."],
  ["chest", "Грудь", "см", "По самой широкой части груди, на спокойном выдохе."],
  ["waist", "Талия", "см", "По самой узкой части туловища, не втягивая живот."],
  ["glutes", "Ягодицы", "см", "По самым выступающим точкам ягодиц, стопы вместе."],
  ["arm", "Обхват руки", "см", "Посередине между плечом и локтем, рука расслаблена."],
  ["thigh", "Одно бедро", "см", "По самой широкой части одного бедра. Выбирай одну и ту же ногу."],
  ["calf", "Икра", "см", "По самой широкой части икры. Каждый раз измеряй ту же ногу."],
];

export function measurementChanges(entries) {
  const previousByKey = new Map();
  const changesByDay = new Map();
  for (const entry of [...entries].reverse()) {
    const changes = {};
    for (const [key] of measurements) {
      if (entry[key] == null) continue;
      const previous = previousByKey.get(key);
      if (previous) {
        changes[key] = { day: previous.day, difference: Math.round((entry[key] - previous[key]) * 10) / 10 };
      }
      previousByKey.set(key, entry);
    }
    changesByDay.set(entry.day, changes);
  }
  return changesByDay;
}
