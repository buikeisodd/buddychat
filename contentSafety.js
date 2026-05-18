const signalSets = {
  emotions: [
    { label: 'fear', words: ['scared', 'afraid', 'worried', 'nervous', 'panic', 'unsafe'] },
    { label: 'sadness', words: ['sad', 'crying', 'lonely', 'alone', 'upset', 'depressed'] },
    { label: 'anger', words: ['angry', 'hate', 'mad', 'furious', 'annoyed'] },
    { label: 'pressure', words: ['secret', 'promise', 'dont tell', "don't tell", 'hide this'] },
  ],
  timing: [
    { label: 'after school', pattern: /\bafter school\b/i },
    { label: 'late night', pattern: /\b(midnight|tonight|late|11 ?pm|12 ?am)\b/i },
    { label: 'specific time', pattern: /\b([1-9]|1[0-2])(:[0-5][0-9])?\s?(am|pm)\b/i },
    { label: 'weekend', pattern: /\b(saturday|sunday|weekend)\b/i },
    { label: 'tomorrow', pattern: /\btomorrow\b/i },
  ],
  locations: [
    { label: 'school', words: ['school', 'classroom', 'playground', 'bus stop'] },
    { label: 'home', words: ['home', 'house', 'bedroom', 'room'] },
    { label: 'public place', words: ['park', 'mall', 'cinema', 'store', 'shop'] },
    { label: 'private place', words: ['alone', 'private', 'secret place', 'my place', 'your place'] },
    { label: 'possible address', pattern: /\b\d{1,5}\s+[a-z]+(?:\s+[a-z]+)?\s+(street|st|road|rd|avenue|ave|drive|dr)\b/i },
  ],
  activities: [
    { label: 'meetup', words: ['meet', 'meet up', 'come over', 'hang out', 'visit'] },
    { label: 'media sharing', words: ['send a picture', 'send photo', 'send video', 'selfie', 'pic of you'] },
    { label: 'call request', words: ['call me', 'video call', 'facetime'] },
    { label: 'personal info', words: ['phone number', 'address', 'where do you live', 'real name'] },
    { label: 'secrecy', words: ['dont tell', "don't tell", 'keep it secret', 'hide this'] },
    { label: 'bullying', words: ['stupid', 'ugly', 'idiot', 'hate you', 'shut up'] },
  ],
};

const riskRules = [
  { category: 'Unsafe meetup', severity: 'high', when: signals => has(signals.activities, 'meetup') && (signals.locations.length > 0 || signals.timing.length > 0) },
  { category: 'Secrecy or pressure', severity: 'high', when: signals => has(signals.activities, 'secrecy') || has(signals.emotions, 'pressure') },
  { category: 'Personal information request', severity: 'high', when: signals => has(signals.activities, 'personal info') || has(signals.locations, 'possible address') },
  { category: 'Media request', severity: 'medium', when: signals => has(signals.activities, 'media sharing') },
  { category: 'Emotional distress', severity: 'medium', when: signals => hasAny(signals.emotions, ['fear', 'sadness', 'anger']) },
  { category: 'Bullying language', severity: 'medium', when: signals => has(signals.activities, 'bullying') },
  { category: 'Time/location context', severity: 'low', when: signals => signals.timing.length > 0 || signals.locations.length > 0 || signals.activities.length > 0 },
];

function has(collection, label) {
  return collection.some(item => item.label === label);
}

function hasAny(collection, labels) {
  return collection.some(item => labels.includes(item.label));
}

function uniqueSignals(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}-${item.label}-${item.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectSignals(text, type, definitions) {
  const lower = text.toLowerCase();

  return definitions.flatMap(definition => {
    const matches = [];

    if (definition.words) {
      definition.words.forEach(word => {
        if (lower.includes(word)) matches.push({ type, label: definition.label, match: word });
      });
    }

    if (definition.pattern) {
      const match = text.match(definition.pattern);
      if (match) matches.push({ type, label: definition.label, match: match[0] });
    }

    return matches;
  });
}

export function analyzeContent({ text, author = 'Unknown', surface = 'message' }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    return { safe: true, report: null };
  }

  const signals = {
    emotions: uniqueSignals(detectSignals(cleanText, 'emotion', signalSets.emotions)),
    timing: uniqueSignals(detectSignals(cleanText, 'timing', signalSets.timing)),
    locations: uniqueSignals(detectSignals(cleanText, 'location', signalSets.locations)),
    activities: uniqueSignals(detectSignals(cleanText, 'activity', signalSets.activities)),
  };

  const matchedRules = riskRules.filter(rule => rule.when(signals));
  if (matchedRules.length === 0) {
    return { safe: true, report: null };
  }

  const severityRank = { low: 1, medium: 2, high: 3 };
  const topRule = matchedRules.reduce((top, rule) => (
    severityRank[rule.severity] > severityRank[top.severity] ? rule : top
  ));

  return {
    safe: topRule.severity !== 'high',
    report: {
      id: crypto.randomUUID(),
      author,
      surface,
      text: cleanText,
      category: topRule.category,
      severity: topRule.severity,
      signals,
      createdAt: new Date().toISOString(),
      status: 'open',
    },
  };
}
