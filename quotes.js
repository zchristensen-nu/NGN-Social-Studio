// Find pull quotes in a story's HTML: direct quotations that are full sentences, with who said them and how the
// story describes that person on first mention ("David Choffnes, a professor in the Khoury College ...").
// StoryQuotes.find(html, max) -> [{ quote, name, desc }] in story order, best candidates only.
// ponytail: pattern-based, tuned to AP-style "…,” says Name." attributions; stories that attribute quotes in
// other shapes yield fewer results, and editors fix the rest on the canvas.
window.StoryQuotes = (() => {
  const NAME = "[A-Z][a-zà-ÿ'’-]+(?:\\s+(?:[A-Z]\\.|[A-Z][a-zà-ÿ'’-]+|de|van|von|da|del|la)){0,3}";
  const VERB = '(?:says|said|explains|explained|adds|added|notes|noted|continues|continued|told)';
  const after = new RegExp(`^\\s*[,.]?\\s*(?:${VERB}\\s+(${NAME})|(${NAME})\\s+${VERB})\\b`);
  const pronoun = new RegExp(`^\\s*[,.]?\\s*(?:she|he|they)\\s+${VERB}\\b`, 'i');
  const before = new RegExp(`(${NAME})\\s+${VERB}[,:]?\\s*$`);
  const NOT_PEOPLE = /^(Northeastern|The|This|That|It|But|And|In|On|At|For|When|While|If|As|So|We|I|You|They|She|He|There|Here)$/;
  // Titles that run into a name ("Secretary of State Marco Rubio" is caught as "State Marco Rubio").
  const TITLE = /^(?:(?:Secretary|State|Senator|Sen\.|Rep\.|Representative|President|Gov\.|Governor|Mayor|Dr\.|Professor|Prof\.|Judge|Chief|Justice|General|Gen\.|Commissioner|Director|Dean)\s+)+/;
  // A descriptor has to name a role; otherwise "According to Jane Doe, organisms adapt ..." would read as a job.
  const ROLE = /\b(?:professor|director|dean|student|graduate|alum\w*|member|engineer|researcher|scientist|chair|founder|officer|president|lecturer|fellow|author|expert|analyst|manager|head|lead|coordinator|partner|ceo|executive|playwright|physician|doctor|nurse|teacher|instructor|assistant|associate|staff|editor|curator|organizer|spokesperson|attorney|lawyer|economist|historian|candidate|scholar|specialist|advocate|chancellor|provost|coach|captain|player|athlete|artist|designer|owner|leader|official|adviser|advisor|consultant|investigator|epidemiologist|psychologist|sociologist|major)s?\b/i;

  // First appositive for each person: "Full Name, <lowercase descriptor>," up to the sentence's next break.
  function people(text) {
    const found = new Map();
    const re = new RegExp(`(${NAME}),\\s+((?:a|an|the|[a-z])[^.;“”]{4,160}?)(?=,\\s*${VERB}\\b|,\\s+(?:who|which|has|have|had|is|was|were|and|but)\\b|[.;]|,\\s+“|$)`, 'gm');
    for (const m of text.matchAll(re)) {
      const full = m[1].trim().replace(TITLE, '');
      if (full.split(/\s+/).length < 2 || NOT_PEOPLE.test(full.split(/\s+/)[0]) || !ROLE.test(m[2])) continue;
      if (!found.has(full)) found.set(full, m[2].trim().replace(/,$/, ''));
    }
    return found;
  }

  // House style for the credit under a text quote, from the posted cards: "Name, lowercase title at Northeastern".
  // AP: titles after a name are lowercase; no leading article; "Northeastern University" shortens to "Northeastern";
  // a Northeastern role without the affiliation gets "at Northeastern" appended. Outside affiliations stay as written.
  const TITLE_WORDS = /\b(Professor|Associate|Assistant|Distinguished|University|Teaching|Research|Executive|Director|Dean|Chair|Lecturer|Senior|Vice|Provost|President|Chancellor|Founding|Interim|Emeritus|Adjunct|Visiting)\b/g;
  const NU_ROLE = /\b(?:professor|student|dean|provost|chancellor|lecturer|faculty|researcher|scientist|alum\w*|graduate|major|college|school of|institute|department|lab|center for|program)\b/i;
  function houseStyle(desc) {
    let d = desc.trim().replace(/[.,;]+$/, '');
    d = d.replace(/^(?:a|an)\s+/i, '').replace(/\band (?:a|an)\s+/g, 'and ');
    d = d.replace(/^([^,]*?)(?=\s+(?:of|in|at|for)\s|$)/, (lead) => lead.replace(TITLE_WORDS, (w) => (w === 'University' && /Northeastern University/.test(lead) ? w : w.toLowerCase())));
    d = d.replace(/Northeastern University(’s|'s)?/g, (m, poss) => `Northeastern${poss || ''}`);
    // "Northeastern professor of X" reads as "professor of X at Northeastern" on the cards.
    if (/^Northeastern\s/.test(d)) d = `${d.replace(/^Northeastern\s+/, '')} at Northeastern`;
    if (!/Northeastern/.test(d) && NU_ROLE.test(d) && !/\s(?:at|with)\s+(?!the\s)[A-Z]/.test(d)) d += ' at Northeastern';
    return d;
  }

  function resolve(name, known, all) {
    name = name?.replace(TITLE, '');
    if (!name || NOT_PEOPLE.test(name.split(/\s+/)[0])) return null;
    for (const full of known.keys()) if (full === name || full.endsWith(` ${name.split(/\s+/).pop()}`)) return full;
    // A full name with no appositive still counts; a lone surname must match someone the story introduced.
    if (name.split(/\s+/).length > 1) return name;
    const m = all.match(new RegExp(`\\b(${NAME.replace('{0,3}', '{0,2}')}\\s+${name})\\b`));
    return m ? m[1].replace(TITLE, '') : null;
  }

  function find(html, max = 3) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const paras = [...doc.querySelectorAll('p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const all = paras.join('\n');
    const known = people(all);
    const out = [];
    let last = null;
    for (const p of paras) {
      for (const m of p.matchAll(/“([^“”]{30,600})”/g)) {
        let quote = m[1].trim();
        const tail = p.slice(m.index + m[0].length), head = p.slice(0, m.index);
        let who = null;
        const a = tail.match(after);
        if (a) who = resolve(a[1] || a[2], known, all);
        else if (pronoun.test(tail)) who = last;
        else { const b = head.match(before); if (b) who = resolve(b[1], known, all); }
        if (!who) continue;
        last = who;
        // A quote ending in a comma before "says" is a whole sentence; give it its period back.
        quote = quote.replace(/,$/, '.');
        if (!/^[A-Z“‘"]/.test(quote) || !/[.?!]$/.test(quote)) continue; // fragments read badly on their own
        if (quote.length < 60 || quote.length > 260) continue; // 260 characters fills the card at 48px
        out.push({ quote, name: who, desc: known.get(who) ? houseStyle(known.get(who)) : '' });
      }
    }
    // Prefer one quote per person, then fill with the rest, keeping story order.
    const picked = [], names = new Set();
    for (const q of out) if (!names.has(q.name) && picked.length < max) { picked.push(q); names.add(q.name); }
    for (const q of out) if (!picked.includes(q) && picked.length < max) picked.push(q);
    return picked.sort((x, y) => out.indexOf(x) - out.indexOf(y));
  }

  return { find, houseStyle };
})();
