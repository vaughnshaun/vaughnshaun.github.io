# Sinhala Language Sources

This document records the external sources used to check the course's grammar and topic coverage. It is hand-maintained. The generated [Course Library](course-library.md) lists the same source links beside the learner material.

The app's examples are newly authored for this project. They are not copied from these publications. Because most new examples have not been reviewed by a Sinhala teacher, they remain marked `AI*` and editable in the app.

## Primary Course Sources

### FSI Basic Course, Module 1

- Source: [Sinhala: Basic Course, Module 1: Beginning Signs and Letters](https://files.eric.ed.gov/fulltext/ED192569.pdf)
- Publisher: U.S. Foreign Service Institute, archived by ERIC
- Used for: Sinhala script sequencing, short and long vowel contrasts, dental and retroflex contrasts, and staged beginner reading.
- Caution: this is a historical course. Its sound and script descriptions remain useful, but social examples and romanization conventions may feel dated.

### FSI Basic Course, Module 2

- Source: [Sinhala: Basic Course, Module 2: General Conversation](https://files.eric.ed.gov/fulltext/ED192570.pdf)
- Publisher: U.S. Foreign Service Institute, archived by ERIC
- Used for: the short thematic-cycle model and coverage of classroom language, address, money, buses, languages, daily routine, geography, agriculture, rail, and air travel.
- Caution: retain the compact lesson design, but prefer current everyday settings, inclusive roles, and present-day vocabulary when adding new examples.

### FSI Basic Course, Module 3

- Source: [Sinhala: Basic Course, Module 3: Sinhala Structures](https://files.eric.ed.gov/fulltext/ED192571.pdf)
- Publisher: U.S. Foreign Service Institute, archived by ERIC
- Used for: noun classes, case and definiteness, present and past verb forms, negative forms, infinitives, participles, conditions, special verbs, demonstratives, postpositions, particles, numerals, quantity, spelling, dialect, and spoken versus written distinctions.
- Caution: the app prioritizes contemporary colloquial Sinhala. Written forms from this source are labeled as written or formal instead of being presented as normal conversation.

### Case-role review for everyday examples

- Basis: the case, pronoun, special-verb, and spoken-versus-written sections of the FSI structures course above, cross-checked against the University of Jaffna materials listed here.
- Used for: distinguishing a normal subject (`මම`), a dative experiencer or target (`මට`), and a direct-object pronoun (`මාව`); targeting wants, needs, ability, liking, feelings, giving, sending, showing, and destinations.
- Design implication: examples prioritize natural conversational dative constructions rather than translating English subject grammar word for word. The `-ව` examples remain limited to natural definite or animate-object contexts rather than being applied mechanically.

### University of Jaffna Basic Sinhala Level I

- Source: [Certificate Course in Basic Sinhala Level I](https://www.codl.jfn.ac.lk/wp-content/uploads/2023/06/Certificate-course-in-Basic-Sinhala-Level-01.pdf)
- Publisher: University of Jaffna, Centre for Open and Distance Learning
- Used for: modern beginner sequencing across alphabet, pronouns and case forms, present/past/future verbs, greetings, and kinship vocabulary.
- Design implication: early lessons should combine script and communication instead of postponing useful speech until the learner masters the full alphabet.

### University of Jaffna Spoken Sinhala Curriculum

- Source: [Department of Linguistics curriculum](https://www.len.jfn.ac.lk/wp-content/uploads/2023/07/13.Linguistics.pdf)
- Publisher: University of Jaffna
- Used for: numerals, colloquial pronouns, negative and prohibitive forms, address, worship and festivals, measurements, directions, kinship, case-marked verbs, self-introduction, telephone and informal dialogues, stories, poems, and register.
- Design implication: the topic library includes practical exchanges and register awareness alongside structural analysis.

## Grammar Research

### Spoken Sinhala Particles

- Source: [A Functional and Categorical Analysis of Particles in Spoken Sinhala](https://doi.org/10.4038/jdrra.v3i2.82)
- Publication: Journal of Desk Research Review and Analysis
- Used for: checking that the advanced inventory goes beyond case endings and includes predicative, highlighting, conjunctive, discourse, interrogative, quotative, and negative particle functions.
- Design implication: particles such as `ත්`, `වත්`, `ලු`, and `නේ` are introduced in multiple phrase families instead of as isolated dictionary entries.

## Coverage Decisions

The current generated curriculum contains 103 grammar structures and 495 bilingual examples. It covers:

- default subject-object-verb order and topic omission;
- pronouns, possession, demonstratives, deixis, noun number, and definiteness;
- accusative, dative, genitive, instrumental/ablative, and location-related marking;
- numerals, ordinals, quantity, adjectives, adverbs, and comparison;
- present, progressive, past, future-oriented, negative, imperative, infinitive, participial, conditional, and purposive forms;
- relative clauses, complements, nominalization, coordination, sequencing, reasons, concessions, and reported speech;
- wants, ability, obligation, possession, experience, probability, emphasis, hearsay, shared-knowledge, and discourse particles;
- colloquial versus formal/written contrasts where they materially affect a learner.

This is broad course coverage, not a claim that Sinhala grammar is exhausted by 103 entries. Regional, social, and speaker variation is real. Politeness, address terms, romanization, and the naturalness of a phrase should be checked against the intended speaker and context.

The imported verb guide uses local JSON files in `my-basic-lessons/` rather than an external source. Those files are romanized, so the app generates Sinhala-script alternatives for study-guide and drill material while preserving the original romanization for the existing transliteration display toggle. Treat the generated Sinhala spellings and English example glosses as functional study support, not native-reviewed sentence translations.

The imported verb guide labels its `-නවා` form as present/nonpast rather than a dedicated continuous tense. It separately contrasts a regular action such as `එයා හැමදාම බත් කනවා.` (“He/she eats rice every day.”) with explicitly ongoing `එයා දැන් බත් කමින් ඉන්නවා.` (“He/she is eating rice now.”). This follows the course's existing distinction between general present usage and the explicit progressive pattern; both examples remain AI-marked study support.

## Content Review Policy

1. Keep source-backed scope separate from newly authored examples.
2. Mark newly authored Sinhala and English with `AI*` until a fluent reviewer approves it.
3. Put corrections in `scripts/curriculum.mjs`, `scripts/expansion-content.mjs`, or `scripts/course-library.mjs`, then run `npm run build:data`.
4. Use the app's Translations view for personal corrections and marker removal; export those edits before moving browsers.
5. When a source conflicts with current native usage, prefer verified contemporary spoken usage and record the reason here.

Last research review: 2026-08-15.
