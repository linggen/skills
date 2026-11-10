// Resolve authored creature references where the world's bestiary is available.
export function describeWord(word, creatures = []) {
  const creature = creatures.find(c => c.id === word?.creature);
  return creature ? { ...word, pinyin: creature.pinyin, hint: creature.look } : word;
}

export function describeDeal(data = {}, creatures = []) {
  const word = w => describeWord(w, creatures);
  const sets = data.sets && Object.fromEntries(Object.entries(data.sets).map(([id, set]) => [id, { ...set, ...(set.words ? { words: set.words.map(word) } : {}) }]));
  return { ...data, ...(data.word ? { word: word(data.word) } : {}),
    ...(data.words ? { words: data.words.map(word) } : {}),
    ...(data.rounds ? { rounds: data.rounds.map(r => ({ ...r, word: word(r.word) })) } : {}),
    ...(sets ? { sets } : {}) };
}
