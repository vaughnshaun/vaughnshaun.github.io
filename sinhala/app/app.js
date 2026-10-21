import { importHash, parseImportableStory } from "./story-import.js";
import { parseReaderImport, readerTokens } from "./reader-import.js";

const IMPORTED_STORIES_STORAGE_KEY = "sinhala-imported-stories";
const IMPORTED_STORY_NOTICE_KEY = "sinhala-story-import-notice";
const READER_DATABASE_NAME = "sinhala-reader-imports";
const READER_DATABASE_VERSION = 1;
const READER_STORE_NAME = "documents";
const READER_FALLBACK_STORAGE_KEY = "sinhala-reader-imports-fallback";
const initialStoryImportNotice = loadStoryImportNotice();

const state = {
  data: null,
  currentLessonId: null,
  currentWordPracticeSetId: null,
  currentSourceLessonId: null,
  currentReferenceLessonId: null,
  currentGrammarLevel: "basic",
  practiceMode: "course",
  exerciseIndex: 0,
  answer: null,
  sessionExercises: [],
  sessionKey: "",
  lessonPass: 1,
  storiesGroupedByGrammar: false,
  openSourceLessonIds: new Set(),
  revealedTranslations: {},
  reviewBank: null,
  completionNotice: "",
  completionPrompt: null,
  referenceSessionSeenReviewKeys: {},
  progress: loadProgress(),
  settings: loadSettings(),
  translationOverrides: loadTranslationOverrides(),
  baseTranslations: {},
  curriculumTranslationEntries: [],
  translationPage: 0,
  translationPageSize: 20,
  translationMessage: "",
  importedStoryRecords: loadImportedStoryRecords(),
  storyImportMessage: initialStoryImportNotice.message,
  storyImportError: initialStoryImportNotice.isError,
  readerDocuments: [],
  currentReaderDocumentId: null,
  pendingReaderFile: null,
  readerImportMessage: "",
  readerImportError: false,
  readerLookup: null
};

const els = {
  streakDays: document.querySelector("#streakDays"),
  courseProgress: document.querySelector("#courseProgress"),
  coursePrinciple: document.querySelector("#coursePrinciple"),
  offlineStatus: document.querySelector("#offlineStatus"),
  continueButton: document.querySelector("#continueButton"),
  lessonPath: document.querySelector("#lessonPath"),
  lessonSelect: document.querySelector("#lessonSelect"),
  grammarLessonSelect: document.querySelector("#grammarLessonSelect"),
  librarySearch: document.querySelector("#librarySearch"),
  libraryContentFilter: document.querySelector("#libraryContentFilter"),
  librarySummary: document.querySelector("#librarySummary"),
  practiceTitle: document.querySelector("#practiceTitle"),
  practiceMeta: document.querySelector("#practiceMeta"),
  practiceProgress: document.querySelector("#practiceProgress"),
  completionNotice: document.querySelector("#completionNotice"),
  practiceCard: document.querySelector("#practiceCard"),
  wordPracticeFilter: document.querySelector("#wordPracticeFilter"),
  transliterationRate: document.querySelector("#transliterationRate"),
  wordPracticeSummary: document.querySelector("#wordPracticeSummary"),
  wordPracticeList: document.querySelector("#wordPracticeList"),
  scriptSearch: document.querySelector("#scriptSearch"),
  storyGrammarOrderToggle: document.querySelector("#storyGrammarOrderToggle"),
  importStoryFile: document.querySelector("#importStoryFile"),
  storyImportMessage: document.querySelector("#storyImportMessage"),
  scriptList: document.querySelector("#scriptList"),
  readerImportFile: document.querySelector("#readerImportFile"),
  readerImportName: document.querySelector("#readerImportName"),
  readerImportButton: document.querySelector("#readerImportButton"),
  readerImportMessage: document.querySelector("#readerImportMessage"),
  readerLibrary: document.querySelector("#readerLibrary"),
  readerContent: document.querySelector("#readerContent"),
  grammarPanel: document.querySelector("#grammarPanel"),
  translationSearch: document.querySelector("#translationSearch"),
  translationLessonFilter: document.querySelector("#translationLessonFilter"),
  translationKindFilter: document.querySelector("#translationKindFilter"),
  translationStatusFilter: document.querySelector("#translationStatusFilter"),
  translationSummary: document.querySelector("#translationSummary"),
  translationList: document.querySelector("#translationList"),
  translationPager: document.querySelector("#translationPager"),
  exportTranslations: document.querySelector("#exportTranslations"),
  importTranslations: document.querySelector("#importTranslations"),
  statsGrid: document.querySelector("#statsGrid"),
  progressPanel: document.querySelector("#progressPanel"),
  lookupPopover: document.querySelector("#lookupPopover")
};

init();

async function init() {
  try {
    const response = await fetch("./data/lessons.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Lesson data request failed with ${response.status}`);
    state.data = await response.json();
    restoreImportedStories();
    state.readerDocuments = await loadReaderDocuments();
    initializeTranslations();
    state.currentLessonId = nextRecommendedLesson()?.id ?? state.data.courseLessons[0]?.id;
    restoreCourseCheckpoint(state.currentLessonId);
    state.currentWordPracticeSetId = state.data.course.wordPracticeSets?.[0]?.id;
    state.currentSourceLessonId = state.data.lessons[0]?.id;
    state.currentReferenceLessonId = state.data.course.referenceLessons?.[0]?.id;
    bindEvents();
    render();
    if (state.storyImportMessage) setView("scripts");
    registerServiceWorker();
  } catch (error) {
    els.lessonPath.innerHTML = `<div class="note-band"><h2>Lesson data is missing</h2><p>Run npm run build:data, then refresh this page.</p></div>`;
    console.error(error);
  }
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
  els.continueButton.addEventListener("click", () => startLesson((nextRecommendedLesson() ?? state.data.courseLessons[0]).id));
  els.lessonSelect.addEventListener("change", (event) => {
    if (event.target.value.startsWith("story:")) startStoryLesson(event.target.value.slice(6));
    else if (event.target.value.startsWith("reference:")) startReferenceLesson(event.target.value.slice(10));
    else if (event.target.value.startsWith("words:")) startWordPractice(event.target.value.slice(6));
    else startLesson(event.target.value);
  });
  els.grammarLessonSelect.addEventListener("change", (event) => {
    state.currentGrammarLevel = event.target.value;
    renderGrammar();
  });
  els.librarySearch.addEventListener("input", renderGrammar);
  els.libraryContentFilter.addEventListener("change", renderGrammar);
  els.wordPracticeFilter.addEventListener("change", () => {
    state.currentWordPracticeSetId = wordPracticeSetsForFilter()[0]?.id ?? state.data.course.wordPracticeSets?.[0]?.id ?? null;
    renderWords();
  });
  els.transliterationRate.addEventListener("change", (event) => {
    state.settings.transliterationRate = Number(event.target.value);
    saveSettings();
    renderWords();
    if (document.querySelector("#practiceView").classList.contains("active")) renderPractice();
  });
  els.scriptSearch.addEventListener("input", () => renderScripts());
  els.storyGrammarOrderToggle.addEventListener("click", () => {
    state.storiesGroupedByGrammar = !state.storiesGroupedByGrammar;
    renderScripts();
  });
  els.importStoryFile.addEventListener("change", importStoryFromFile);
  els.readerImportFile.addEventListener("change", selectReaderFile);
  els.readerImportButton.addEventListener("click", importReaderFile);
  els.translationSearch.addEventListener("input", () => {
    state.translationPage = 0;
    renderTranslationEditor();
  });
  els.translationLessonFilter.addEventListener("change", () => {
    state.translationPage = 0;
    renderTranslationEditor();
  });
  els.translationKindFilter.addEventListener("change", () => {
    state.translationPage = 0;
    renderTranslationEditor();
  });
  els.translationStatusFilter.addEventListener("change", () => {
    state.translationPage = 0;
    renderTranslationEditor();
  });
  els.exportTranslations.addEventListener("click", exportTranslationEdits);
  els.importTranslations.addEventListener("change", importTranslationEdits);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".word-token") && !event.target.closest(".lookup-popover")) closeLookup();
  });
}

function render() {
  els.coursePrinciple.textContent = state.data.course.principle;
  renderHeader();
  renderPath();
  renderPractice();
  renderWords();
  renderScripts();
  renderReader();
  renderGrammar();
  renderTranslationEditor();
  renderStats();
}

function renderHeader() {
  const completed = state.data.courseLessons.filter((lesson) => state.progress.lessons[lesson.id]).length;
  const total = state.data.courseLessons.length || 1;
  els.courseProgress.style.width = `${Math.round((completed / total) * 100)}%`;
  els.streakDays.textContent = state.progress.streakDays;
  const next = nextRecommendedLesson() ?? state.data.courseLessons.at(-1);
  const level = levelById(next?.level);
  const checkpoint = currentCourseCheckpoint();
  els.coursePrinciple.textContent = checkpoint
    ? `Resume ${checkpoint.lessonTitle ?? next?.title ?? "Lesson"} · Round ${checkpoint.lessonPass}/${requiredPassesForMode("course")} · ${level.title}`
    : `${next?.title ?? "Course complete"} of ${total} · ${level.title}`;
  els.transliterationRate.value = String(state.settings.transliterationRate);
}

function renderPath() {
  let currentUnit = 0;
  const recommended = nextRecommendedLesson()?.id;
  els.lessonPath.innerHTML = state.data.courseLessons
    .map((lesson) => {
      const level = levelById(lesson.level);
      const checkpoint = checkpointForLesson(lesson.id);
      const roundProgress = lessonRoundProgress(lesson);
      const roundLabel = checkpoint ? `Round ${checkpoint.lessonPass}/${requiredPassesForMode("course")}` : "";
      const unitLabel =
        lesson.unit !== currentUnit
          ? `<section class="level-band">
              <p class="unit-label">Unit ${lesson.unit}</p>
              <p>${escapeHtml(level.title)} · ${escapeHtml(lesson.focus)}</p>
            </section>`
          : "";
      currentUnit = lesson.unit;
      const done = Boolean(state.progress.lessons[lesson.id]);
      const active = lesson.id === recommended;
      return `${unitLabel}
        <article class="lesson-node ${done ? "done" : ""} ${active ? "recommended" : ""}">
          <div class="node-medal ${checkpoint ? "in-progress" : ""}" style="--round-progress:${roundProgress}">
            <svg class="node-ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="node-ring-track" cx="22" cy="22" r="19"></circle>
              <circle class="node-ring-fill" cx="22" cy="22" r="19"></circle>
            </svg>
            <span class="node-medal-label">${done ? "✓" : lesson.number}</span>
          </div>
          <div>
            <h3>${escapeHtml(lesson.title)}${active ? " · Recommended" : ""}</h3>
            <p>${escapeHtml(lesson.focus)}</p>
            <div class="lesson-meta">
              <span class="pill">${escapeHtml(level.title)}</span>
              ${roundLabel ? `<span class="pill">${escapeHtml(roundLabel)}</span>` : ""}
              ${lesson.referenceTopicTitle ? `<span class="pill topic-pill">Topic: ${escapeHtml(lesson.referenceTopicTitle)}</span>` : ""}
              <span class="pill">${lesson.subLessons.length} short parts</span>
              <span class="pill">${lesson.roundQuestionTarget ?? lesson.exercises.length} questions/round</span>
              ${lesson.variationPool?.length ? `<span class="pill">${lesson.variationPool.length} variations</span>` : ""}
              <span class="pill">${lesson.xp} XP</span>
            </div>
          </div>
          <button class="small-action" type="button" data-start="${lesson.id}">${done ? "Review" : checkpoint ? "Resume" : active ? "Continue" : "Jump"}</button>
        </article>`;
    })
    .join("");

  els.lessonPath.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startLesson(button.dataset.start));
  });
  renderPracticeLessonSelect();
  els.grammarLessonSelect.innerHTML = state.data.course.levels
    .map((level) => `<option value="${level.id}">${escapeHtml(level.title)}</option>`)
    .join("");
  els.grammarLessonSelect.value = state.currentGrammarLevel;
}

function wordPracticeSetsForFilter() {
  const filter = els.wordPracticeFilter.value || "all";
  const allSets = state.data.course.wordPracticeSets ?? [];
  if (filter === "all") return allSets;
  return allSets.filter((set) => set.level === filter || set.id === filter);
}

function renderWords() {
  const allSets = state.data.course.wordPracticeSets ?? [];
  const filters = ["all", ...new Set(allSets.map((set) => set.level))];
  els.wordPracticeFilter.innerHTML = filters
    .map((value) => `<option value="${escapeHtml(value)}">${value === "all" ? "All word sets" : `${escapeHtml(levelById(value).title)} only`}</option>`)
    .join("");
  if (!filters.includes(els.wordPracticeFilter.value)) els.wordPracticeFilter.value = "all";
  const visibleSets = wordPracticeSetsForFilter();
  if (!visibleSets.some((set) => set.id === state.currentWordPracticeSetId)) {
    state.currentWordPracticeSetId = visibleSets[0]?.id ?? allSets[0]?.id ?? null;
  }
  const totalWords = visibleSets.reduce((total, set) => total + set.items.length, 0);
  const completed = visibleSets.filter((set) => state.progress.wordPractices[set.id]).length;
  els.wordPracticeSummary.innerHTML = `<strong>${visibleSets.length} drills · ${totalWords} words · ${completed} completed</strong><span>Practice direct word translation in both directions. Lesson transliteration rate is currently ${Math.round((state.settings.transliterationRate ?? 0) * 100)}%.</span>`;
  els.wordPracticeList.innerHTML = visibleSets
    .map(
      (set) => `<article class="grammar-row">
        <strong>${escapeHtml(set.title)}</strong>
        <p>${escapeHtml(set.goal)}</p>
        <div class="lesson-meta">
          <span class="pill">${escapeHtml(levelById(set.level).title)}</span>
          <span class="pill">${set.items.length} words</span>
          <span class="pill">${set.xp} XP</span>
        </div>
        <div class="reference-topic-actions">
          <button class="small-action" type="button" data-start-word-set="${escapeHtml(set.id)}">Practice words</button>
        </div>
      </article>`
    )
    .join("") || `<div class="library-empty">No word drills are available for this filter.</div>`;
  els.wordPracticeList.querySelectorAll("[data-start-word-set]").forEach((button) => {
    button.addEventListener("click", () => startWordPractice(button.dataset.startWordSet));
  });
}

function renderPractice() {
  const lesson = currentLesson();
  if (!lesson) return;
  els.practiceTitle.textContent = lesson.title;
  renderPracticeLessonSelect();
  if (state.completionPrompt) {
    renderSidePracticeCompletion(lesson);
    return;
  }
  const exercises = currentSessionExercises(lesson);
  const exercise = exercises[state.exerciseIndex % exercises.length];
  if (state.practiceMode === "story") state.currentSourceLessonId = lesson.id;
  else if (state.practiceMode === "course" && exercise.sourceLessonId) state.currentSourceLessonId = exercise.sourceLessonId;
  const modeLabel =
    state.practiceMode === "story"
      ? "Story practice"
      : state.practiceMode === "reference"
        ? "Topic review"
        : state.practiceMode === "words"
          ? "Word drill"
        : `${levelById(lesson.level).title}${lesson.referenceTopicTitle ? ` · ${lesson.referenceTopicTitle}` : ""}`;
  const partLabel = `${exercise.sessionSubLessonTitle} ${exercise.sessionSubLessonIndex}/${exercise.sessionSubLessonTotal}`;
  const requiredPasses = requiredPassesForLesson();
  const passLabel = requiredPasses > 1 ? ` · Round ${state.lessonPass}/${requiredPasses}` : "";
  const overallSteps = exercises.length * requiredPasses;
  const currentStep = ((state.lessonPass - 1) * exercises.length) + state.exerciseIndex + 1;
  const coverageLabel = state.practiceMode === "story" ? ` · ${storyCoverageLabel(lesson)}` : "";
  els.practiceMeta.textContent = `${modeLabel}${passLabel}${coverageLabel} · ${partLabel} · ${currentStep}/${overallSteps}`;
  els.practiceProgress.style.width = `${Math.round((currentStep / overallSteps) * 100)}%`;
  els.completionNotice.hidden = !state.completionNotice;
  els.completionNotice.textContent = state.completionNotice;
  const renderers = {
    choice: renderChoiceCard,
    word_choice: renderWordChoiceCard,
    matching: renderMatchingCard,
    fill_blank: renderFillBlankCard,
    sentence_build: renderSentenceBuildCard,
    structure: renderStructureCard,
    response: renderResponseCard,
    speaking: renderSpeakingCard,
    shadow: renderSpeakingCard,
    grammar_choice: renderGrammarChoiceCard,
    conversation_choice: renderConversationChoiceCard,
    conversation_response: renderConversationResponseCard
  };
  (renderers[exercise.type] ?? renderSpeakingCard)(lesson, exercise, exercises.length);
  if (state.practiceMode === "course") saveCourseCheckpoint();
}

function renderChoiceCard(lesson, exercise, total) {
  const checked = state.answer !== null;
  const correct = state.answer === exercise.answer;
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Translate this word ${translationBadge(exercise)}</span>
        <div class="sinhala-text">${practiceSinhalaHtml(exercise.prompt, "", exercise, { tokens: false })}</div>
      </div>
      <div>
        <div class="choice-grid">${(exercise.sessionChoices ?? exercise.choices).map((choice) => choiceButton(choice, checked, exercise.answer, { disabled: checked })).join("")}</div>
        <p class="feedback">${checked ? (correct ? "Correct." : `Answer: ${escapeHtml(exercise.answer)}`) : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${checked ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Choose an answer"}</button>
      </div>
    </div>`;
  if (!checked) {
    els.practiceCard.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        state.answer = button.dataset.choice;
        recordAttempt(exercise, button.dataset.choice === exercise.answer);
        renderPractice();
      });
    });
  }
  nextButton(() => advanceExercise(lesson, total));
}

function renderWordChoiceCard(lesson, exercise, total) {
  const checked = state.answer !== null;
  const correct = state.answer === exercise.answer;
  const promptHtml =
    exercise.direction === "en_to_si"
      ? `<h3>${escapeHtml(exercise.promptEn)}</h3>`
      : `<div class="sinhala-text">${practiceSinhalaHtml(exercise.promptSi, "", exercise, { transliteration: exercise.promptTransliteration, tokens: false })}</div>`;
  const choiceLanguage = exercise.direction === "en_to_si" ? "si" : "en";
  const answerLabel = exercise.direction === "en_to_si" ? visibleSinhalaText(exercise.answer, exercise, exercise.promptTransliteration) : exercise.answer;
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">${exercise.direction === "en_to_si" ? "Choose the Sinhala word" : "Choose the English meaning"}</span>
        ${promptHtml}
      </div>
      <div>
        <div class="choice-grid">${(exercise.choiceItems ?? []).map((choice) => choiceButton(choice.value, checked, exercise.answer, { exercise, choiceLanguage, transliteration: choice.transliteration })).join("")}</div>
        <p class="feedback">${checked ? (correct ? "Correct." : `Answer: ${escapeHtml(answerLabel)}`) : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${checked ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Choose an answer"}</button>
      </div>
    </div>`;
  els.practiceCard.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answer = button.dataset.choice;
      recordAttempt(exercise, button.dataset.choice === exercise.answer);
      renderPractice();
    });
  });
  nextButton(() => advanceExercise(lesson, total));
}

function renderMatchingCard(lesson, exercise, total) {
  const answer = state.answer ?? {};
  const complete = exercise.pairs.every((pair) => answer[pair.si]);
  const checked = complete && answer.__checked;
  const englishChoices = exercise.sessionChoices ?? stableShuffle(exercise.pairs.map((pair) => pair.en), exercise.prompt);
  const correct = checked && exercise.pairs.every((pair) => answer[pair.si] === pair.en);
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Matching ${translationBadge({ aiMarked: exercise.pairs.some((pair) => pair.aiMarked) })}</span>
        <h3>${escapeHtml(exercise.prompt)}</h3>
      </div>
      <div class="match-list">
        ${exercise.pairs
          .map(
            (pair) => `<label class="match-row">
              <strong>${practiceSinhalaHtml(pair.si, "", exercise, { tokens: false })}</strong>
              <select data-match="${escapeHtml(pair.si)}" ${checked ? "disabled" : ""}>
                <option value="">Choose</option>
                ${englishChoices.map((choice) => `<option value="${escapeHtml(choice)}" ${answer[pair.si] === choice ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
              </select>
            </label>`
          )
          .join("")}
      </div>
      <div>
        <p class="feedback">${checked ? (correct ? "All matched." : "Some matches need review.") : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${complete ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Check matches"}</button>
      </div>
    </div>`;
  els.practiceCard.querySelectorAll("[data-match]").forEach((select) => {
    select.addEventListener("change", () => {
      state.answer = { ...(state.answer ?? {}), [select.dataset.match]: select.value };
      renderPractice();
    });
  });
  nextButton(() => {
    if (!checked) {
      state.answer = { ...state.answer, __checked: true };
      recordAttempt(exercise, exercise.pairs.every((pair) => state.answer[pair.si] === pair.en));
      renderPractice();
      return;
    }
    advanceExercise(lesson, total);
  });
}

function renderFillBlankCard(lesson, exercise, total) {
  const checked = state.answer !== null;
  const correct = state.answer === exercise.answer;
  const translationVisible = isTranslationRevealed(exercise);
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Fill in the blank</span>
        <div class="sinhala-text">${practiceSinhalaHtml(exercise.prompt, "", exercise, { tokens: false })}</div>
        ${revealTranslationBlock(exercise, translationVisible)}
      </div>
      <div>
        <div class="choice-grid">${(exercise.sessionChoices ?? exercise.wordBank).map((choice) => choiceButton(choice, checked, exercise.answer, { exercise, choiceLanguage: "si" })).join("")}</div>
        <p class="feedback">${checked ? (correct ? "That fits the sentence." : `Answer: ${escapeHtml(exercise.answer)}`) : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${checked ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Choose the missing word"}</button>
      </div>
    </div>`;
  bindTranslationReveal(exercise);
  els.practiceCard.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answer = button.dataset.choice;
      recordAttempt(exercise, button.dataset.choice === exercise.answer);
      renderPractice();
    });
  });
  nextButton(() => advanceExercise(lesson, total));
}

function renderSentenceBuildCard(lesson, exercise, total) {
  const bank = exercise.sessionChoices ?? exercise.wordBank;
  const answerState = state.answer && Array.isArray(state.answer.selected) ? state.answer : { selected: [], checked: false };
  const selectedTokens = answerState.selected.map((index) => bank[index]).filter((token) => token !== undefined);
  const builtAnswer = selectedTokens.join(" ");
  const ready = selectedTokens.length > 0;
  const checked = Boolean(answerState.checked);
  const correct = checked && normalizeBuiltSentence(builtAnswer) === normalizeBuiltSentence(exercise.answer);
  const promptClass = exercise.direction === "si_to_en" ? "sinhala-text compact" : "sentence-build-prompt";
  const promptLabel = exercise.direction === "si_to_en" ? "Build this sentence in English" : "Build this sentence in Sinhala";
  els.practiceCard.innerHTML = `
    <div class="card-stage sentence-builder">
      <div class="prompt">
        <span class="prompt-label">${promptLabel} ${translationBadge(exercise)}</span>
        <div class="${promptClass}">${exercise.direction === "si_to_en" ? practiceSinhalaHtml(exercise.prompt, "", exercise, { compact: true, tokens: false }) : escapeHtml(exercise.prompt)}</div>
      </div>
      <div class="sentence-build-workspace">
        <div class="sentence-answer-area ${checked ? (correct ? "correct" : "wrong") : ""}" aria-label="Your constructed sentence">
          <div class="sentence-answer-tiles">
            ${selectedTokens.length
              ? selectedTokens
                  .map(
                    (token, position) => `<button class="word-tile answer-tile" type="button" data-answer-position="${position}" ${checked ? "disabled" : ""}>${escapeHtml(visibleSinhalaText(token, exercise))}</button>`
                  )
                  .join("")
              : `<span>Tap the words below to build your answer.</span>`}
          </div>
        </div>
        <div class="sentence-bank" aria-label="Available words">
          ${bank
            .map(
              (token, index) => `<button class="word-tile ${answerState.selected.includes(index) ? "used" : ""}" type="button" data-bank-index="${index}" ${checked || answerState.selected.includes(index) ? "disabled" : ""}>${escapeHtml(visibleSinhalaText(token, exercise))}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <p class="feedback" aria-live="polite">${checked ? (correct ? "Correct sentence." : `Answer: ${escapeHtml(exercise.answer)}`) : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${ready ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Check"}</button>
      </div>
    </div>`;
  if (!checked) {
    els.practiceCard.querySelectorAll("[data-bank-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.answer = { selected: [...answerState.selected, Number(button.dataset.bankIndex)], checked: false };
        renderPractice();
      });
    });
    els.practiceCard.querySelectorAll("[data-answer-position]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = [...answerState.selected];
        selected.splice(Number(button.dataset.answerPosition), 1);
        state.answer = { selected, checked: false };
        renderPractice();
      });
    });
  }
  nextButton(() => {
    if (!checked) {
      const isCorrect = normalizeBuiltSentence(builtAnswer) === normalizeBuiltSentence(exercise.answer);
      state.answer = { ...answerState, checked: true };
      recordAttempt(exercise, isCorrect);
      renderPractice();
      return;
    }
    advanceExercise(lesson, total);
  });
}

function renderStructureCard(lesson, exercise, total) {
  const revealed = state.answer === "revealed";
  const translationVisible = isTranslationRevealed(exercise);
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Sentence structure</span>
        <div class="sinhala-text compact">${practiceSinhalaHtml(exercise.prompt, "", exercise, { compact: true, tokens: false })}</div>
        ${revealTranslationBlock(exercise, translationVisible)}
      </div>
      <div>
        ${revealed ? structureHtml(exercise.structure) : `<p class="feedback">Find the final verb and any endings like -ට, -ගේ, or -ව.</p>`}
        <button class="secondary-action" type="button" id="nextExercise">${revealed ? nextLabel(lesson, total) : "Reveal structure"}</button>
      </div>
    </div>`;
  bindTranslationReveal(exercise);
  nextButton(() => {
    if (!revealed) {
      state.answer = "revealed";
      recordAttempt(exercise, true);
      renderPractice();
      return;
    }
    advanceExercise(lesson, total);
  });
}

function renderResponseCard(lesson, exercise, total) {
  const response = state.answer ?? "";
  const ready = response.trim().length > 0;
  const translationVisible = isTranslationRevealed(exercise, "sample");
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Respond</span>
        <h3>${escapeHtml(exercise.prompt)}</h3>
        ${revealTextBlock(exercise, "sample", "Reveal sample support", translationVisible, `Sample support: ${escapeHtml(exercise.sample)}`)}
      </div>
      <div>
        <textarea id="responseInput" class="response-input" rows="4" placeholder="Type your Sinhala response, or say it aloud and write a short note.">${escapeHtml(response)}</textarea>
        <p class="feedback">${ready ? "Good. The goal is producing Sinhala, not perfection." : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${ready ? "" : "disabled"}>${ready ? nextLabel(lesson, total) : "Write or note your answer"}</button>
      </div>
    </div>`;
  bindTranslationReveal(exercise, "sample");
  els.practiceCard.querySelector("#responseInput").addEventListener("input", (event) => {
    state.answer = event.target.value;
    els.practiceCard.querySelector("#nextExercise").disabled = !event.target.value.trim();
  });
  nextButton(() => {
    recordAttempt(exercise, true);
    advanceExercise(lesson, total);
  });
}

function renderGrammarChoiceCard(lesson, exercise, total) {
  const answerState =
    state.answer && typeof state.answer === "object" && !Array.isArray(state.answer)
      ? state.answer
      : { selected: "", revealed: [], checked: false };
  const checked = Boolean(answerState.checked);
  const correct = checked && answerState.selected === exercise.answer;
  const choices = exercise.sessionChoices ?? exercise.choices;
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Grammar</span>
        <h3>${escapeHtml(exercise.prompt)}</h3>
        <p class="pattern-line">${escapeHtml(exercise.pattern)}</p>
        <p class="translation">${escapeHtml(exercise.explanation)}</p>
      </div>
      <div>
        <p class="feedback">Tap a phrase to reveal its translation, then choose the example that best matches this structure.</p>
        <div class="choice-grid bilingual-grid">${choices
          .map((choice) => bilingualChoiceButton(choice, checked, exercise.answer, answerState.revealed, exercise, { disabled: checked }))
          .join("")}</div>
        <p class="feedback">${checked ? (correct ? "That is the pattern." : `Answer: ${escapeHtml(exercise.exampleSi)} = ${escapeHtml(exercise.exampleEn)} ${translationBadge({ aiMarked: exercise.exampleAiMarked })}`) : ""}</p>
        ${checked ? "" : `<button class="secondary-action" type="button" id="checkGrammarChoice" ${answerState.selected ? "" : "disabled"}>Submit</button>`}
        ${checked ? `<button class="secondary-action" type="button" id="nextExercise">${nextLabel(lesson, total)}</button>` : ""}
      </div>
    </div>`;
  els.practiceCard.querySelectorAll("[data-bilingual-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = button.dataset.bilingualChoice;
      const revealed = answerState.revealed.includes(choice) ? answerState.revealed : [...answerState.revealed, choice];
      state.answer = { selected: choice, revealed, checked: false };
      renderPractice();
    });
  });
  els.practiceCard.querySelector("#checkGrammarChoice")?.addEventListener("click", () => {
    if (!answerState.selected) return;
    state.answer = { ...answerState, checked: true };
    recordAttempt(exercise, answerState.selected === exercise.answer);
    renderPractice();
  });
  nextButton(() => advanceExercise(lesson, total));
}

function renderConversationChoiceCard(lesson, exercise, total) {
  const checked = state.answer !== null;
  const correct = state.answer === exercise.answer;
  const choices = exercise.sessionChoices ?? exercise.choices;
  const promptVisible = isTranslationRevealed(exercise, "prompt");
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Conversation · ${escapeHtml(exercise.title)}</span>
        <p class="conversation-context">${escapeHtml(exercise.context)}</p>
        <div class="dialogue-turn">
          <strong>${practiceSinhalaHtml(exercise.aSi, exercise.aEn, exercise)}</strong>
          ${revealTextBlock(exercise, "prompt", "Reveal line meaning", promptVisible, `${escapeHtml(exercise.aEn)} ${translationBadge({ aiMarked: exercise.aAiMarked })}`)}
        </div>
      </div>
      <div>
        <p class="feedback">Choose a natural reply.</p>
        <div class="choice-grid bilingual-grid">${choices.map((choice) => bilingualChoiceButton(choice, checked, exercise.answer, [], exercise)).join("")}</div>
        <p class="feedback">${checked ? (correct ? "Natural reply." : `Best reply: ${escapeHtml(exercise.answer)} = ${escapeHtml(exercise.answerEn)} ${translationBadge({ aiMarked: exercise.replyAiMarked })}`) : ""}</p>
        <button class="secondary-action" type="button" id="nextExercise" ${checked ? "" : "disabled"}>${checked ? nextLabel(lesson, total) : "Choose a reply"}</button>
      </div>
    </div>`;
  bindWordLookups(els.practiceCard);
  bindTranslationReveal(exercise, "prompt");
  els.practiceCard.querySelectorAll("[data-bilingual-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answer = button.dataset.bilingualChoice;
      recordAttempt(exercise, state.answer === exercise.answer);
      renderPractice();
    });
  });
  nextButton(() => advanceExercise(lesson, total));
}

function renderConversationResponseCard(lesson, exercise, total) {
  const response = state.answer ?? "";
  const ready = response.trim().length > 0;
  const promptVisible = isTranslationRevealed(exercise, "prompt");
  const sampleVisible = isTranslationRevealed(exercise, "sample");
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">Conversation · ${escapeHtml(exercise.title)}</span>
        <p class="conversation-context">${escapeHtml(exercise.context)}</p>
        <div class="dialogue-turn">
          <strong>${practiceSinhalaHtml(exercise.aSi, exercise.aEn, exercise)}</strong>
          ${revealTextBlock(exercise, "prompt", "Reveal line meaning", promptVisible, `${escapeHtml(exercise.aEn)} ${translationBadge({ aiMarked: exercise.aAiMarked })}`)}
        </div>
      </div>
      <div>
        <textarea id="responseInput" class="response-input" rows="3" placeholder="Reply in Sinhala, or say it aloud and write a short note.">${escapeHtml(response)}</textarea>
        ${revealTextBlock(exercise, "sample", "Reveal sample reply", sampleVisible, `Sample: ${escapeHtml(exercise.sample)} ${translationBadge({ aiMarked: exercise.replyAiMarked })}`)}
        <button class="secondary-action" type="button" id="nextExercise" ${ready ? "" : "disabled"}>${ready ? nextLabel(lesson, total) : "Write or note your reply"}</button>
      </div>
    </div>`;
  bindWordLookups(els.practiceCard);
  bindTranslationReveal(exercise, "prompt");
  bindTranslationReveal(exercise, "sample");
  els.practiceCard.querySelector("#responseInput").addEventListener("input", (event) => {
    state.answer = event.target.value;
    els.practiceCard.querySelector("#nextExercise").disabled = !event.target.value.trim();
  });
  nextButton(() => {
    recordAttempt(exercise, true);
    advanceExercise(lesson, total);
  });
}

function renderSpeakingCard(lesson, exercise, total) {
  const checked = state.answer === "spoken";
  const translationVisible = isTranslationRevealed(exercise);
  els.practiceCard.innerHTML = `
    <div class="card-stage">
      <div class="prompt">
        <span class="prompt-label">${escapeHtml(exercise.speaker ?? "Speaking")}</span>
        <div class="sinhala-text compact">${practiceSinhalaHtml(exercise.prompt, exercise.translation, exercise, { compact: true })}</div>
        ${revealTranslationBlock(exercise, translationVisible)}
      </div>
      <div>
        ${checked ? grammarNotes(lesson) : `<p class="feedback">Say it slowly, then say it again at video speed.</p>`}
        <button class="secondary-action" type="button" id="nextExercise">${checked ? nextLabel(lesson, total) : "I said it aloud"}</button>
      </div>
    </div>`;
  bindWordLookups(els.practiceCard);
  bindTranslationReveal(exercise);
  nextButton(() => {
    if (!checked) {
      state.answer = "spoken";
      recordAttempt(exercise, true);
      renderPractice();
      return;
    }
    advanceExercise(lesson, total);
  });
}

function choiceButton(choice, checked, answer, options = {}) {
  const classes = ["choice"];
  if (checked && choice === state.answer) classes.push(choice === answer ? "correct" : "wrong");
  if (checked && choice === answer) classes.push("correct");
  const label =
    options.choiceLanguage === "si"
      ? visibleSinhalaText(choice, options.exercise, options.transliteration)
      : String(choice);
  const labelClass = options.choiceLanguage === "si" && hasSinhalaText(choice) ? "choice-label sinhala-choice" : "choice-label";
  return `<button class="${classes.join(" ")}" type="button" data-choice="${escapeHtml(choice)}" ${options.disabled ? "disabled" : ""}><span class="${labelClass}">${escapeHtml(label)}</span></button>`;
}

function bilingualChoiceButton(choice, checked, answer, revealedChoices = [], exercise = null, options = {}) {
  const classes = ["choice", "bilingual-choice"];
  const selectedAnswer = state.answer && typeof state.answer === "object" ? state.answer.selected : state.answer;
  const selected = choice.si === selectedAnswer;
  if (selected) classes.push("selected");
  if (checked && choice.si === selectedAnswer) classes.push(choice.si === answer ? "correct" : "wrong");
  else if (checked && choice.si === answer) classes.push("correct");
  const revealed = revealedChoices.includes(choice.si);
  return `<button class="${classes.join(" ")}" type="button" data-bilingual-choice="${escapeHtml(choice.si)}" aria-pressed="${selected}" ${options.disabled ? "disabled" : ""}><strong class="${hasSinhalaText(choice.si) ? "sinhala-choice" : ""}">${escapeHtml(visibleSinhalaText(choice.si, exercise ?? choice, choice.transliteration))}</strong><small class="${revealed || checked ? "" : "translation-hidden"}">${revealed || checked ? `${escapeHtml(choice.en)} ${translationBadge(choice)}` : "Tap to reveal translation"}</small></button>`;
}

function nextButton(handler) {
  els.practiceCard.querySelector("#nextExercise")?.addEventListener("click", handler);
}

function translationRevealKey(exercise, section = "main") {
  return `${state.practiceMode}:${currentLesson()?.id}:${exercise.reviewKey ?? exercise.id}:${section}`;
}

function isTranslationRevealed(exercise, section = "main") {
  return Boolean(state.revealedTranslations[translationRevealKey(exercise, section)]);
}

function revealTranslation(exercise, section = "main") {
  state.revealedTranslations[translationRevealKey(exercise, section)] = true;
}

function revealTextBlock(exercise, section, buttonLabel, visible, contentHtml) {
  if (visible) return `<p class="translation">${contentHtml}</p>`;
  return `<button class="small-action reveal-translation-action" type="button" data-reveal-translation="${escapeHtml(section)}">${escapeHtml(buttonLabel)}</button>`;
}

function revealTranslationBlock(exercise, visible) {
  return revealTextBlock(
    exercise,
    "main",
    "Reveal translation",
    visible,
    `${escapeHtml(exercise.translation ?? exercise.answer ?? "")} ${translationBadge(exercise)}`
  );
}

function bindTranslationReveal(exercise, section = "main") {
  els.practiceCard.querySelectorAll(`[data-reveal-translation="${section}"]`).forEach((button) => {
    button.addEventListener("click", () => {
      revealTranslation(exercise, section);
      renderPractice();
    });
  });
}

function grammarNotes(lesson) {
  if (!lesson.grammarLessons?.length) return `<p class="feedback">Good. Keep the sentence rhythm and move on.</p>`;
  return `<div class="grammar-list">
    ${lesson.grammarLessons
      .slice(0, 2)
      .map((item) => `<div class="grammar-row"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.explanation)}</p></div>`)
      .join("")}
  </div>`;
}

function structureHtml(structure = {}) {
  const partRows = Object.entries(structure.parts ?? {})
    .filter(([, values]) => values?.length)
    .map(([name, values]) => `<div><span>${escapeHtml(partLabel(name))}</span><strong>${escapeHtml(values.join(", "))}</strong></div>`)
    .join("");
  return `<div class="structure-box">
    <p><strong>Likely order:</strong> ${escapeHtml(structure.likelyOrder ?? "Subject / setting / object / verb")}</p>
    ${partRows ? `<div class="parts-grid">${partRows}</div>` : ""}
    <p><strong>Final verb:</strong> ${escapeHtml(structure.finalVerb || "Look near the end of the sentence.")}</p>
    ${structure.connectors?.length ? `<p><strong>Connectors:</strong> ${escapeHtml(structure.connectors.join(", "))}</p>` : ""}
    ${structure.negation?.length ? `<p><strong>Negation:</strong> ${escapeHtml(structure.negation.join(", "))}</p>` : ""}
    ${structure.endings?.length ? `<p><strong>Endings:</strong> ${structure.endings.map((item) => `${escapeHtml(item.word)} ${escapeHtml(item.role)}`).join("; ")}</p>` : ""}
  </div>`;
}

function nextLabel(lesson, total) {
  if (state.exerciseIndex + 1 < total) return "Next";
  if (state.practiceMode === "story" && state.lessonPass < requiredPassesForLesson()) return "Next round";
  return state.practiceMode === "course" ? `Continue +${lesson.xp} XP` : `Finish +${lesson.xp} XP`;
}

function advanceExercise(lesson, total) {
  state.answer = null;
  if (state.exerciseIndex + 1 >= total) {
    if (state.practiceMode === "words") {
      completeWordPractice(lesson);
      finishSidePractice(lesson, `${lesson.title} complete · +${lesson.xp} XP.`);
      renderWords();
      return;
    }
    if (state.practiceMode === "story") {
      const requiredPasses = requiredPassesForLesson();
      if (state.lessonPass < requiredPasses) {
        state.lessonPass += 1;
        state.exerciseIndex = 0;
        state.sessionKey = "";
        state.sessionExercises = [];
        state.revealedTranslations = {};
        state.completionNotice = `${lesson.title} round ${state.lessonPass - 1}/${requiredPasses} complete. Loading more story practice.`;
        renderScripts();
        renderHeader();
        renderPractice();
        return;
      }
      completeStoryPractice(lesson);
      finishSidePractice(lesson, `${lesson.title} story practice complete · +${lesson.xp} XP.`);
      renderScripts();
      return;
    }
    if (state.practiceMode === "reference") {
      completeReferencePractice(lesson);
      finishSidePractice(lesson, `${lesson.title} topic review complete · +${lesson.xp} XP.`);
      renderGrammar();
      return;
    }
    const requiredPasses = requiredPassesForLesson();
    if (state.lessonPass < requiredPasses) {
      state.lessonPass += 1;
      state.exerciseIndex = 0;
      state.sessionKey = "";
      state.sessionExercises = [];
      state.revealedTranslations = {};
      state.completionNotice = `${lesson.title} round ${state.lessonPass - 1}/${requiredPasses} complete. Loading a new variation.`;
      saveCourseCheckpoint();
      renderPath();
      renderHeader();
      renderPractice();
      return;
    }
    completeLesson(lesson);
    clearCourseCheckpoint(lesson.id);
    const next = nextCourseLessonAfter(lesson.id);
    state.exerciseIndex = 0;
    state.lessonPass = 1;
    state.revealedTranslations = {};
    state.sessionKey = "";
    state.sessionExercises = [];
    state.completionNotice = next
      ? `${lesson.title} complete · +${lesson.xp} XP. Starting ${next.title}.`
      : `Course complete · +${lesson.xp} XP.`;
    if (next) state.currentLessonId = next.id;
    renderHeader();
    renderPath();
    renderPractice();
    setView("practice");
    window.setTimeout(() => {
      state.completionNotice = "";
      els.completionNotice.hidden = true;
    }, 2600);
    return;
  }
  state.completionNotice = "";
  state.exerciseIndex += 1;
  saveCourseCheckpoint();
  renderPath();
  renderPractice();
}

function importedReferenceLessonIds() {
  return (state.data?.course.referenceLessons ?? []).map((lesson) => lesson.id);
}

function loadImportedStoryRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(IMPORTED_STORIES_STORAGE_KEY));
    if (!Array.isArray(records)) return [];
    return records
      .filter((record) => record && typeof record.markdown === "string" && typeof record.fileName === "string")
      .map((record) => ({
        id: String(record.id ?? ""),
        fileName: record.fileName,
        markdown: record.markdown,
        importedAt: record.importedAt ?? ""
      }));
  } catch {
    return [];
  }
}

function loadStoryImportNotice() {
  try {
    const notice = JSON.parse(sessionStorage.getItem(IMPORTED_STORY_NOTICE_KEY));
    sessionStorage.removeItem(IMPORTED_STORY_NOTICE_KEY);
    return { message: String(notice?.message ?? ""), isError: Boolean(notice?.isError) };
  } catch {
    return { message: "", isError: false };
  }
}

function saveStoryImportNotice(message, isError = false) {
  sessionStorage.setItem(IMPORTED_STORY_NOTICE_KEY, JSON.stringify({ message, isError }));
}

function saveImportedStoryRecords(records) {
  localStorage.setItem(IMPORTED_STORIES_STORAGE_KEY, JSON.stringify(records));
}

function restoreImportedStories() {
  const restored = [];
  const failed = [];
  for (const record of state.importedStoryRecords) {
    try {
      const parsed = parseImportableStory(record.markdown, {
        fileName: record.fileName,
        referenceLessonIds: importedReferenceLessonIds()
      });
      const normalizedRecord = { ...record, id: parsed.id };
      integrateImportedStory(parsed, normalizedRecord);
      restored.push(normalizedRecord);
    } catch (error) {
      console.warn(`Could not restore imported story ${record.fileName}.`, error);
      failed.push(record.fileName);
    }
  }
  state.importedStoryRecords = [...restored, ...state.importedStoryRecords.filter((record) => failed.includes(record.fileName))];
  if (failed.length) {
    state.storyImportMessage = `${failed.length} saved story ${failed.length === 1 ? "file needs" : "files need"} to be imported again.`;
    state.storyImportError = true;
  }
}

async function importStoryFromFile(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    if (!/\.md$/i.test(file.name)) throw new Error("Choose an importable Markdown (.md) story file.");
    if (file.size > 2_000_000) throw new Error("Story files must be 2 MB or smaller for device-local storage.");
    const markdown = await file.text();
    const parsed = parseImportableStory(markdown, {
      fileName: file.name,
      referenceLessonIds: importedReferenceLessonIds()
    });
    const record = {
      id: parsed.id,
      fileName: file.name,
      markdown,
      importedAt: new Date().toISOString()
    };
    const nextRecords = [...state.importedStoryRecords.filter((item) => item.id !== parsed.id), record];
    saveImportedStoryRecords(nextRecords);
    const routedCards = potentialImportedCourseCardCount(parsed);
    saveStoryImportNotice(`Imported ${parsed.title}: ${parsed.passages.length} lines and ${parsed.vocabulary.length} tagged words or phrases. Added ${routedCards} topic-aligned Course variations.${parsed.duplicateGlossaryEntries ? ` Merged ${parsed.duplicateGlossaryEntries} duplicate glossary ${parsed.duplicateGlossaryEntries === 1 ? "entry" : "entries"}.` : ""}`);
    window.location.reload();
  } catch (error) {
    state.storyImportMessage = error.message || "That story file could not be imported.";
    state.storyImportError = true;
    renderStoryImportMessage(true);
  }
}

function renderStoryImportMessage(isError = state.storyImportError) {
  els.storyImportMessage.textContent = state.storyImportMessage;
  els.storyImportMessage.hidden = !state.storyImportMessage;
  els.storyImportMessage.classList.toggle("is-error", Boolean(isError));
}

function forgetImportedStory(id) {
  const lesson = sourceLessonById(id);
  if (!lesson?.importedByUser) return;
  if (!window.confirm(`Forget “${lesson.title}” on this device? The original Markdown file will not be deleted.`)) return;
  const nextRecords = state.importedStoryRecords.filter((record) => record.id !== id);
  try {
    saveImportedStoryRecords(nextRecords);
  } catch (error) {
    state.storyImportMessage = "The imported story could not be removed from device storage.";
    renderStoryImportMessage(true);
    return;
  }
  saveStoryImportNotice(`Forgot ${lesson.title} on this device. Its original Markdown file was not changed.`);
  window.location.reload();
}

function potentialImportedCourseCardCount(parsed) {
  return parsed.vocabulary.reduce(
    (total, item) => total + state.data.courseLessons.filter(
      (lesson) => levelRank(item.level) <= levelRank(lesson.level) && item.referenceLessonIds.some((id) => lesson.referenceLessonIds?.includes(id))
    ).length,
    0
  );
}

function importChoiceItems(item, vocabulary, count = 4) {
  const choices = [item];
  for (const candidate of vocabulary) {
    if (candidate.translationKey === item.translationKey || choices.some((choice) => choice.en.toLocaleLowerCase() === candidate.en.toLocaleLowerCase())) continue;
    choices.push(candidate);
    if (choices.length >= count) break;
  }
  return choices;
}

function importedChoiceExercise(item, vocabulary, extra = {}) {
  const choiceItems = importChoiceItems(item, vocabulary);
  if (choiceItems.length < 2) return null;
  return {
    type: "choice",
    prompt: item.si,
    answer: item.en,
    kind: item.kind,
    tags: item.tags,
    topics: item.topics,
    grammarTags: item.grammarTags,
    referenceLessonIds: item.referenceLessonIds,
    sourceLevel: item.level,
    answerTranslationKey: item.translationKey,
    choiceTranslations: choiceItems.map((choice) => ({ en: choice.en, translationKey: choice.translationKey, aiMarked: choice.aiMarked })),
    choices: choiceItems.map((choice) => choice.en),
    aiMarked: item.aiMarked,
    reviewKey: `vocab:${cleanToken(item.si)}`,
    skillId: `vocab:${cleanToken(item.si)}`,
    ...extra
  };
}

function importedSentenceExercise(passage, direction, distractorTokens, sourceLevel) {
  const answerTokens = sentenceTokensForBuild(direction === "en_to_si" ? passage.si : passage.en);
  if (answerTokens.length < 2 || answerTokens.length > 16) return null;
  const answerSet = new Set(answerTokens.map((token) => token.toLocaleLowerCase()));
  const distractors = uniqueStrings(distractorTokens.filter((token) => !answerSet.has(token.toLocaleLowerCase()))).slice(0, 4);
  return {
    type: "sentence_build",
    direction,
    prompt: direction === "en_to_si" ? passage.en : passage.si,
    si: passage.si,
    en: passage.en,
    answer: answerTokens.join(" "),
    answerTokens,
    distractorTokens: distractors,
    wordBank: [...answerTokens, ...distractors],
    translation: passage.en,
    translationKey: passage.translationKey,
    translationStatus: passage.translationStatus,
    aiMarked: passage.aiMarked,
    tags: passage.tags,
    reviewKey: `sentence:${passage.translationKey}:${direction}`,
    skillId: `sentence:${passage.translationKey}`,
    sourceLevel
  };
}

function uniqueStrings(values) {
  return [...new Map(values.filter(Boolean).map((value) => [String(value).toLocaleLowerCase(), String(value)])).values()];
}

function createImportedStoryLesson(parsed, record) {
  const userStoryId = parsed.id;
  const passages = parsed.passages.map((passage, index) => {
    const translationKey = `user-passage:${userStoryId}:${importHash(passage.si)}`;
    const grammarMatches = (state.data.course.scriptGrammarRules ?? []).filter((rule) => passage.tags.includes(rule.id));
    return {
      id: `p-${index + 1}`,
      ...passage,
      translationKey,
      translationStatus: "translated",
      translationOrigin: "imported story file",
      aiMarked: false,
      structure: readerSentenceStructure(passage.si),
      grammarMatches,
      sentences: [{
        readerKey: `${translationKey}:sentence-1`,
        si: passage.si,
        grammarMatchIds: grammarMatches.map((rule) => rule.id),
        structure: readerSentenceStructure(passage.si)
      }]
    };
  });
  const vocabulary = parsed.vocabulary.map((item, index) => ({
    id: `v-${index + 1}`,
    si: item.si,
    en: item.meanings[0],
    alternatives: item.meanings.slice(1),
    kind: item.kind,
    level: item.level,
    tags: item.tags,
    topics: item.topics,
    grammarTags: item.grammarTags,
    referenceLessonIds: item.referenceLessonIds,
    translationKey: `user-vocab:${userStoryId}:${importHash(item.si)}`,
    translationStatus: "translated",
    translationOrigin: "imported story file",
    aiMarked: false,
    userStoryId,
    sourceTitle: parsed.title
  }));
  const exercises = vocabulary.map((item) => importedChoiceExercise(item, vocabulary)).filter(Boolean);
  for (let index = 0; index < vocabulary.length; index += 5) {
    const group = vocabulary.slice(index, index + 5);
    if (group.length < 2) continue;
    exercises.push({
      type: "matching",
      prompt: "Match Sinhala words and phrases to English meanings.",
      pairs: group.map((item) => ({ si: item.si, en: item.en, translationKey: item.translationKey, aiMarked: false })),
      reviewKey: `matching:${userStoryId}:${Math.floor(index / 5) + 1}`,
      skillId: `matching:${userStoryId}:${Math.floor(index / 5) + 1}`
    });
  }
  const sinhalaDistractors = uniqueStrings(vocabulary.flatMap((item) => sentenceTokensForBuild(item.si)));
  const englishDistractors = uniqueStrings(vocabulary.flatMap((item) => sentenceTokensForBuild(item.en)));
  passages.forEach((passage, index) => {
    const enToSi = importedSentenceExercise(passage, "en_to_si", sinhalaDistractors, parsed.level);
    const siToEn = importedSentenceExercise(passage, "si_to_en", englishDistractors, parsed.level);
    if (enToSi) exercises.push(enToSi);
    if (siToEn) exercises.push(siToEn);
    const tokens = sentenceTokensForBuild(passage.si);
    if (tokens.length >= 2) {
      const answer = tokens[0];
      exercises.push({
        type: "fill_blank",
        prompt: ["_____", ...tokens.slice(1)].join(" "),
        answer,
        translation: passage.en,
        translationKey: passage.translationKey,
        translationStatus: passage.translationStatus,
        aiMarked: false,
        tags: passage.tags,
        wordBank: uniqueStrings([answer, ...sinhalaDistractors.filter((token) => token !== answer).slice(index % 8, (index % 8) + 3)]),
        reviewKey: `fill:${passage.translationKey}`,
        skillId: `passage:${passage.translationKey}:fill`
      });
    }
    exercises.push({
      type: "structure",
      prompt: passage.si,
      translation: passage.en,
      translationKey: passage.translationKey,
      translationStatus: passage.translationStatus,
      aiMarked: false,
      tags: passage.tags,
      structure: passage.structure,
      reviewKey: `structure:${passage.translationKey}`,
      skillId: `passage:${passage.translationKey}:structure`
    });
    exercises.push({
      type: "speaking",
      prompt: passage.si,
      translation: passage.en,
      translationKey: passage.translationKey,
      translationStatus: passage.translationStatus,
      aiMarked: false,
      tags: passage.tags,
      speaker: passage.speaker,
      answer: "Read it aloud, then reveal the structure.",
      reviewKey: `speaking:${passage.translationKey}`,
      skillId: `passage:${passage.translationKey}:speaking`
    });
  });
  for (let index = 0; index < vocabulary.length; index += 3) {
    const group = vocabulary.slice(index, index + 3);
    if (!group.length) continue;
    exercises.push({
      type: "response",
      prompt: `Use one of these in a short Sinhala response: ${group.map((item) => item.si).join(", ")}`,
      sample: `${group[0].si} = ${group[0].en}`,
      answer: "Type or say your own short answer.",
      reviewKey: `response:${userStoryId}:${Math.floor(index / 3) + 1}`,
      skillId: `response:${userStoryId}:${Math.floor(index / 3) + 1}`
    });
  }
  return {
    id: userStoryId,
    userStoryId,
    importedByUser: true,
    importKind: "story",
    title: parsed.title,
    source: `Imported on this device · ${record.fileName}`,
    difficulty: parsed.difficulty,
    level: parsed.level,
    focus: parsed.topics.join(", ") || "Imported story",
    topics: parsed.topics,
    tags: uniqueStrings(["device-import", ...parsed.tags]),
    grammarTags: parsed.grammarTags,
    lineCount: parsed.passages.length,
    vocabulary,
    passages,
    grammar: {},
    grammarLessons: [],
    exercises,
    storyExercises: exercises,
    xp: 20,
    importedAt: record.importedAt
  };
}

function integrateImportedStory(parsed, record) {
  const lesson = createImportedStoryLesson(parsed, record);
  const userStoryId = lesson.id;
  state.data.lessons.push(lesson);
  for (const item of lesson.vocabulary) {
    for (const set of state.data.course.wordPracticeSets ?? []) {
      if (set.id !== "words-mixed" && set.level !== item.level) continue;
      if (!set.items.some((candidate) => candidate.translationKey === item.translationKey)) set.items.push({ ...item });
    }
    const baseExercise = importedChoiceExercise(item, lesson.vocabulary);
    if (!baseExercise) continue;
    for (const courseLesson of state.data.courseLessons) {
      if (levelRank(item.level) > levelRank(courseLesson.level)) continue;
      const referenceLessonId = item.referenceLessonIds.find((id) => courseLesson.referenceLessonIds?.includes(id));
      if (!referenceLessonId) continue;
      courseLesson.variationPool ??= [];
      courseLesson.variationPool.push({
        ...baseExercise,
        id: `${courseLesson.id}-user-story-${importHash(`${userStoryId}:${item.si}`)}`,
        sourceLessonId: userStoryId,
        sourceTitle: lesson.title,
        referenceLessonId,
        topicAligned: true,
        courseRole: "topic",
        userStoryId,
        subLessonId: `${courseLesson.id}-warmup`,
        subLessonTitle: "Warm-up",
        subLessonKind: "warmup",
        variationPool: true
      });
    }
  }
}

function openReaderDatabase() {
  return new Promise((resolve, reject) => {
    if (!readerDatabaseAvailable()) {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(READER_DATABASE_NAME, READER_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(READER_STORE_NAME)) request.result.createObjectStore(READER_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Reader storage could not be opened."));
  });
}

function readerDatabaseAvailable() {
  return typeof indexedDB !== "undefined" && indexedDB && typeof indexedDB.open === "function";
}

function loadReaderFallbackRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(READER_FALLBACK_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveReaderFallbackRecords(records) {
  localStorage.setItem(READER_FALLBACK_STORAGE_KEY, JSON.stringify(records));
}

async function saveReaderRecord(record) {
  if (readerDatabaseAvailable()) return readerStoreRequest("readwrite", (store) => store.put(record));
  const records = loadReaderFallbackRecords();
  saveReaderFallbackRecords([...records.filter((item) => item?.id !== record.id), record]);
}

async function deleteReaderRecord(id) {
  if (readerDatabaseAvailable()) return readerStoreRequest("readwrite", (store) => store.delete(id));
  saveReaderFallbackRecords(loadReaderFallbackRecords().filter((item) => item?.id !== id));
}

function readerStoreRequest(mode, action) {
  return openReaderDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(READER_STORE_NAME, mode);
        const request = action(transaction.objectStore(READER_STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Reader storage could not be updated."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("Reader storage could not be updated."));
      })
  );
}

async function loadReaderDocuments() {
  try {
    const records = readerDatabaseAvailable() ? await readerStoreRequest("readonly", (store) => store.getAll()) : loadReaderFallbackRecords();
    return records
      .filter((record) => record?.document?.id && Array.isArray(record.document.passages) && Array.isArray(record.document.vocabulary))
      .sort((a, b) => String(b.importedAt ?? "").localeCompare(String(a.importedAt ?? "")))
      .map((record) => record.document);
  } catch (error) {
    console.warn("Could not restore Reader imports.", error);
    state.readerImportMessage = "Saved Reader imports could not be opened on this device.";
    state.readerImportError = true;
    return [];
  }
}

function selectedReaderDocument() {
  return state.readerDocuments.find((document) => document.id === state.currentReaderDocumentId) ?? null;
}

function readerNameFromFileName(fileName) {
  return String(fileName ?? "").replace(/\.(json|md)$/i, "").replace(/[-_]+/g, " ").trim();
}

function renderReaderImportMessage() {
  els.readerImportMessage.textContent = state.readerImportMessage;
  els.readerImportMessage.hidden = !state.readerImportMessage;
  els.readerImportMessage.classList.toggle("is-error", state.readerImportError);
}

function renderReader() {
  const document = selectedReaderDocument();
  renderReaderImportMessage();
  els.readerLibrary.innerHTML = state.readerDocuments.length
    ? state.readerDocuments
        .map(
          (item) => `<article class="reader-library-item ${item.id === document?.id ? "open" : ""}">
            <div><strong>${escapeHtml(item.title)}</strong><span>${item.passages.length} lines · ${item.vocabulary.length} glossary entries</span></div>
            <div class="reader-library-actions"><button class="small-action" type="button" data-open-reader="${escapeHtml(item.id)}">${item.id === document?.id ? "Close" : "Open"}</button><button class="small-action danger-action" type="button" data-remove-reader="${escapeHtml(item.id)}">Remove</button></div>
          </article>`
        )
        .join("")
    : `<div class="note-band"><p>No personal transcripts imported yet.</p></div>`;
  els.readerContent.innerHTML = document
    ? readerDocumentHtml(document)
    : `<div class="note-band"><h3>Choose a transcript to read</h3><p>Import a translated transcript above, then press Open. The original file stays untouched; this device keeps a private reader copy.</p></div>`;
  els.readerLibrary.querySelectorAll("[data-open-reader]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentReaderDocumentId = state.currentReaderDocumentId === button.dataset.openReader ? null : button.dataset.openReader;
      state.readerLookup = null;
      renderReader();
    });
  });
  els.readerLibrary.querySelectorAll("[data-remove-reader]").forEach((button) => {
    button.addEventListener("click", () => removeReaderDocument(button.dataset.removeReader));
  });
  bindReaderEvents(document);
}

function readerDocumentHtml(document) {
  let previousSpeaker = null;
  const lines = document.passages
    .map((line) => {
      const heading = line.speaker !== previousSpeaker ? `<h3 class="reader-speaker">${escapeHtml(line.speaker)}</h3>` : "";
      previousSpeaker = line.speaker;
      return `${heading}<article class="personal-reader-line" data-reader-line="${escapeHtml(line.id)}">
        <p class="reader-si">${renderReaderTokens(line, document)}</p>
        ${readerLookupHtml(line, document)}
      </article>`;
    })
    .join("");
  return `<article class="personal-reader-document"><div class="personal-reader-heading"><div><p class="eyebrow">Personal transcript</p><h2>${escapeHtml(document.title)}</h2></div><span>${document.passages.length} lines · ${document.vocabulary.length} glossary entries</span></div><div class="personal-reader-lines">${lines}</div></article>`;
}

function renderReaderTokens(line, document) {
  return line.si
    .split(/(\s+|[.,!?;:()[\]'"“”‘’…]+)/)
    .filter(Boolean)
    .map((token) => {
      if (!/[\u0D80-\u0DFF]/.test(token)) return escapeHtml(token);
      const word = readerTokens(token)[0] ?? "";
      const selected = state.readerLookup?.documentId === document.id && state.readerLookup?.lineId === line.id && state.readerLookup?.word === word;
      return `<button class="reader-word-token ${selected ? "selected" : ""}" type="button" data-reader-word="${escapeHtml(word)}" data-reader-line-id="${escapeHtml(line.id)}">${escapeHtml(token)}</button>`;
    })
    .join("");
}

function readerMatchesForWord(document, word) {
  const normalized = readerTokens(word)[0] ?? "";
  const entries = document.vocabulary ?? [];
  const exact = entries.filter((item) => readerTokens(item.si).join(" ") === normalized);
  return dedupeReaderVocabulary(exact);
}

function dedupeReaderVocabulary(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.si}:${(item.meanings ?? []).join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readerMeaningHtml(meanings) {
  return `<span class="reader-meanings">${(meanings ?? []).map((meaning) => `<span>${escapeHtml(meaning)}</span>`).join("")}</span>`;
}

function readerLookupHtml(line, document) {
  const lookup = state.readerLookup;
  if (!lookup || lookup.documentId !== document.id || lookup.lineId !== line.id) return "";
  const exact = readerMatchesForWord(document, lookup.word);
  const fullTranslationVisible = Boolean(lookup.fullTranslationVisible);
  return `<section class="reader-lookup-card" aria-live="polite">
    <div class="reader-lookup-heading"><strong>${escapeHtml(lookup.word)}</strong><button class="copy-button" type="button" data-close-reader-lookup>Close</button></div>
    ${exact.length ? `<div><p class="reader-lookup-label">Meanings</p>${exact.map((item) => readerMeaningHtml(item.meanings)).join("")}</div>` : `<p class="reader-lookup-empty">No direct glossary meaning for this word yet.</p>`}
    ${lookup.editing ? `<label class="reader-meaning-editor">${exact.length ? "Edit meanings" : "Add meanings"} <small>Separate alternatives with |</small><input id="readerMeaningInput" value="${escapeHtml(exact[0]?.meanings.join(" | ") ?? "")}" placeholder="English meaning"></label><div class="reader-edit-actions"><button class="small-action" type="button" data-save-reader-meaning>${exact.length ? "Save meaning" : "Add meaning"}</button><button class="small-action" type="button" data-cancel-reader-meaning>Cancel</button></div>` : `<button class="reader-line-translation-toggle" type="button" data-edit-reader-meaning>${exact.length ? "Edit word meaning" : "Add word meaning"}</button>`}
    <button class="reader-line-translation-toggle" type="button" data-toggle-reader-line-translation>${fullTranslationVisible ? "Hide full line translation" : "Show full line translation"}</button>
    ${fullTranslationVisible ? `<p class="reader-line-translation">${escapeHtml(line.en)}</p>` : ""}
  </section>`;
}

function bindReaderEvents(document) {
  if (!document) return;
  els.readerContent.querySelectorAll("[data-reader-word]").forEach((button) => {
    button.addEventListener("click", () => {
      const sameSelection =
        state.readerLookup?.documentId === document.id &&
        state.readerLookup?.lineId === button.dataset.readerLineId &&
        state.readerLookup?.word === button.dataset.readerWord;
      state.readerLookup = sameSelection
        ? null
        : { documentId: document.id, lineId: button.dataset.readerLineId, word: button.dataset.readerWord, fullTranslationVisible: false };
      renderReader();
    });
  });
  els.readerContent.querySelector("[data-close-reader-lookup]")?.addEventListener("click", () => {
    state.readerLookup = null;
    renderReader();
  });
  els.readerContent.querySelector("[data-toggle-reader-line-translation]")?.addEventListener("click", () => {
    if (state.readerLookup) state.readerLookup.fullTranslationVisible = !state.readerLookup.fullTranslationVisible;
    renderReader();
  });
  els.readerContent.querySelector("[data-edit-reader-meaning]")?.addEventListener("click", () => {
    if (state.readerLookup) state.readerLookup.editing = true;
    renderReader();
  });
  els.readerContent.querySelector("[data-cancel-reader-meaning]")?.addEventListener("click", () => {
    if (state.readerLookup) state.readerLookup.editing = false;
    renderReader();
  });
  els.readerContent.querySelector("[data-save-reader-meaning]")?.addEventListener("click", async () => {
    const input = els.readerContent.querySelector("#readerMeaningInput");
    await saveReaderWordMeaning(document, state.readerLookup?.word, input?.value ?? "");
  });
}

async function saveReaderWordMeaning(document, word, value) {
  const meanings = value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!meanings.length) {
    state.readerImportMessage = "Add at least one English meaning before saving.";
    state.readerImportError = true;
    renderReaderImportMessage();
    return;
  }
  const normalized = readerTokens(word)[0] ?? "";
  let found = false;
  const update = (item) => {
    if (readerTokens(item.si).join(" ") === normalized) {
      item.meanings = [...new Set(meanings)];
      found = true;
    }
  };
  document.vocabulary.forEach(update);
  document.passages.forEach((line) => line.vocabulary.forEach(update));
  if (!found) {
    const item = { si: word, meanings: [...new Set(meanings)] };
    document.vocabulary.push(item);
    document.passages.find((line) => line.id === state.readerLookup?.lineId)?.vocabulary.push({ ...item });
  }
  try {
    await saveReaderRecord({ id: document.id, importedAt: new Date().toISOString(), document });
    state.readerDocuments = state.readerDocuments.map((item) => (item.id === document.id ? document : item));
    state.readerLookup = { ...state.readerLookup, editing: false };
    state.readerImportMessage = `Saved the meaning for ${word} in ${document.title}.`;
    state.readerImportError = false;
    renderReader();
  } catch (error) {
    state.readerImportMessage = error.message || "That word meaning could not be saved.";
    state.readerImportError = true;
    renderReaderImportMessage();
  }
}

function selectReaderFile(event) {
  const [file] = event.target.files;
  state.pendingReaderFile = file ?? null;
  if (file) els.readerImportName.value = readerNameFromFileName(file.name);
  state.readerImportMessage = file ? `Ready to import ${file.name}. Choose a saved name, then import it.` : "";
  state.readerImportError = false;
  renderReaderImportMessage();
}

async function importReaderFile() {
  const file = state.pendingReaderFile;
  if (!file) {
    state.readerImportMessage = "Choose a transcript.json or translated Markdown file first.";
    state.readerImportError = true;
    renderReaderImportMessage();
    return;
  }
  try {
    if (!/\.(json|md)$/i.test(file.name)) throw new Error("Choose a transcript.json or translated transcript Markdown (.md) file.");
    if (file.size > 10_000_000) throw new Error("Reader files must be 10 MB or smaller.");
    const document = parseReaderImport(await file.text(), { fileName: file.name, name: els.readerImportName.value });
    const record = { id: document.id, importedAt: new Date().toISOString(), document };
    await saveReaderRecord(record);
    state.readerDocuments = [document, ...state.readerDocuments.filter((item) => item.id !== document.id)];
    state.currentReaderDocumentId = null;
    state.pendingReaderFile = null;
    els.readerImportFile.value = "";
    state.readerImportMessage = `Imported ${document.title}: ${document.passages.length} lines and ${document.vocabulary.length} glossary entries.${state.readerDocuments.some((item) => item.id === document.id) ? " Re-import this name any time to replace it." : ""}`;
    state.readerImportError = false;
    state.readerLookup = null;
    renderReader();
  } catch (error) {
    state.readerImportMessage = error.message || "That reader file could not be imported.";
    state.readerImportError = true;
    renderReaderImportMessage();
  }
}

async function removeReaderDocument(documentId) {
  const document = state.readerDocuments.find((item) => item.id === documentId);
  if (!document) return;
  if (!window.confirm(`Remove “${document.title}” from this device? The original file will not be deleted.`)) return;
  try {
    await deleteReaderRecord(document.id);
    state.readerDocuments = state.readerDocuments.filter((item) => item.id !== document.id);
    if (state.currentReaderDocumentId === document.id) state.currentReaderDocumentId = null;
    state.readerLookup = null;
    state.readerImportMessage = `Removed ${document.title} from this device.`;
    state.readerImportError = false;
    renderReader();
  } catch (error) {
    state.readerImportMessage = error.message || "That reader file could not be removed.";
    state.readerImportError = true;
    renderReaderImportMessage();
  }
}

function renderScripts() {
  renderStoryImportMessage();
  const term = els.scriptSearch.value.trim().toLowerCase();
  const lessons = state.data.lessons.filter((lesson) => {
    const haystack = `${lesson.title} ${lesson.focus} ${(lesson.topics ?? []).join(" ")} ${(lesson.tags ?? []).join(" ")} ${(lesson.grammarTags ?? []).join(" ")} ${lesson.passages.map((passage) => `${passage.speaker} ${(passage.tags ?? []).join(" ")}`).join(" ")} ${lesson.vocabulary.map((item) => `${item.si} ${item.en} ${(item.tags ?? []).join(" ")}`).join(" ")}`.toLowerCase();
    return !term || haystack.includes(term);
  });
  els.storyGrammarOrderToggle.textContent = state.storiesGroupedByGrammar ? "Show normal order" : "Group by grammar";
  els.storyGrammarOrderToggle.setAttribute("aria-pressed", String(state.storiesGroupedByGrammar));

  els.scriptList.innerHTML = lessons
    .map((lesson) => {
      const translated = lesson.passages.filter((passage) => passage.translationStatus !== "draft-gloss").length;
      const aiMarked = lesson.passages.filter((passage) => passage.aiMarked).length;
      const openLabel = lesson.passages.length ? "Read full script" : "Open vocabulary notes";
      const isOpen = state.openSourceLessonIds.has(lesson.id);
      const storyPractice = state.progress.storyPractices[lesson.id];
      const practiced = storyPractice?.completedAt
        ? ` · practiced ${storyPractice.timesPracticed ?? 1}x`
        : storyPractice?.seenReviewKeys?.length
          ? ` · ${storyPractice.seenReviewKeys.length}/${storyPractice.totalReviewKeys ?? storyReviewKeys(lesson).length} practiced`
          : "";
      return `<article class="script-item ${isOpen ? "open" : ""}">
        <div class="script-head">
          <div>
            <h3>${escapeHtml(lesson.title)}</h3>
            <p>${escapeHtml(lesson.source)} · ${lesson.passages.length} lines · ${translated} translations${aiMarked ? ` · ${aiMarked} AI*` : ""}${practiced}</p>
            ${grammarTagsHtml([lesson.level, lesson.difficulty, ...(lesson.topics ?? []), ...(lesson.tags ?? [])])}
          </div>
          <button class="small-action" type="button" data-open="${lesson.id}" data-open-label="${openLabel}">${isOpen ? "Close" : openLabel}</button>
        </div>
        <div class="script-body">
          <div class="reader-tools">
            <button class="small-action" type="button" data-copy-lesson="${lesson.id}">${lesson.passages.length ? "Copy full script" : "Copy vocabulary notes"}</button>
            ${storyExerciseBank(lesson).length ? `<button class="small-action" type="button" data-practice-story="${lesson.id}">Practice this story</button>` : ""}
            ${lesson.importedByUser ? `<button class="small-action danger-action" type="button" data-remove-imported-story="${escapeHtml(lesson.id)}">Forget imported story</button>` : ""}
            <button class="small-action" type="button" data-continue-course>Resume numbered course</button>
          </div>
          ${
            lesson.passages.length
              ? `<div><h3>${state.storiesGroupedByGrammar ? "Sentences by grammar difficulty" : "Lines and translations"}</h3>${readerLinesHtml(lesson.passages)}</div>`
              : ""
          }
          <div>
            <h3>Vocabulary</h3>
            <div class="vocab-list">${lesson.vocabulary.map((item) => vocabRow(item)).join("")}</div>
          </div>
        </div>
      </article>`;
    })
    .join("");

  els.scriptList.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".script-item");
      item.classList.toggle("open");
      if (item.classList.contains("open")) state.openSourceLessonIds.add(button.dataset.open);
      else state.openSourceLessonIds.delete(button.dataset.open);
      button.textContent = item.classList.contains("open") ? "Close" : button.dataset.openLabel;
      if (item.classList.contains("open")) {
        state.progress.readerOpens += 1;
        saveProgress();
      }
    });
  });
  els.scriptList.querySelectorAll("[data-copy-line]").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.copyLine, "line"));
  });
  els.scriptList.querySelectorAll("[data-story-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = `story:${button.dataset.readerKey}:${button.dataset.storyToggle}`;
      state.revealedTranslations[key] = !state.revealedTranslations[key];
      const visible = Boolean(state.revealedTranslations[key]);
      button.textContent =
        button.dataset.storyToggle === "translation"
          ? visible
            ? "Hide translation"
            : "Reveal translation"
          : visible
            ? "Hide grammar"
            : "Reveal grammar";
      const panel = [...els.scriptList.querySelectorAll(`[data-story-panel="${button.dataset.storyToggle}"]`)].find(
        (item) => item.dataset.readerKey === button.dataset.readerKey
      );
      panel?.classList.toggle("hidden", !visible);
    });
  });
  els.scriptList.querySelectorAll("[data-copy-lesson]").forEach((button) => {
    const lesson = sourceLessonById(button.dataset.copyLesson);
    const text = lesson.passages.length
      ? lesson.passages.map((line) => `${line.si}\n${line.en}`).join("\n\n")
      : lesson.vocabulary.map((item) => `${item.si} = ${item.en}`).join("\n");
    button.addEventListener("click", () => copyText(text, lesson.passages.length ? "script" : "notes"));
  });
  els.scriptList.querySelectorAll("[data-continue-course]").forEach((button) => {
    button.addEventListener("click", () => startLesson((nextRecommendedLesson() ?? currentLesson()).id));
  });
  els.scriptList.querySelectorAll("[data-practice-story]").forEach((button) => {
    button.addEventListener("click", () => startStoryLesson(button.dataset.practiceStory));
  });
  els.scriptList.querySelectorAll("[data-remove-imported-story]").forEach((button) => {
    button.addEventListener("click", () => forgetImportedStory(button.dataset.removeImportedStory));
  });
  bindWordLookups(els.scriptList);
}

function primaryGrammarMatch(line) {
  return grammarMatchesForLine(line).sort(
    (a, b) => (b.difficultyRank ?? 0) - (a.difficultyRank ?? 0)
  )[0];
}

function grammarMatchesForLine(line) {
  if (Array.isArray(line.grammarMatches) && typeof line.grammarMatches[0] === "object") return [...line.grammarMatches];
  const ruleById = new Map((state.data.course.scriptGrammarRules ?? []).map((rule) => [rule.id, rule]));
  return (line.grammarMatchIds ?? line.grammarMatches ?? []).map((id) => ruleById.get(id)).filter(Boolean);
}

function readerLinesHtml(passages) {
  if (!state.storiesGroupedByGrammar) return passages.map((line) => readerLine(line)).join("");
  const groups = new Map();
  for (const line of readerSentenceLines(passages)) {
    const match = primaryGrammarMatch(line);
    const key = match ? `${match.difficultyRank}:${match.id}` : "unmatched";
    if (!groups.has(key)) {
      groups.set(key, {
        rank: match?.difficultyRank ?? Number.MAX_SAFE_INTEGER,
        title: match?.title ?? "Ungrouped sentences",
        description: match?.pattern ?? match?.explanation ?? "No grammar rule matched this line strongly.",
        lines: []
      });
    }
    groups.get(key).lines.push(line);
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .map(
      (group) => `<section class="reader-grammar-group">
        <div class="reader-grammar-heading">
          <span>${group.rank === Number.MAX_SAFE_INTEGER ? "Later" : `Rank ${group.rank}`}</span>
          <div>
            <h4>${escapeHtml(group.title)}</h4>
            <p>${escapeHtml(group.description)}</p>
          </div>
        </div>
        ${group.lines.map((line) => readerLine(line)).join("")}
      </section>`
    )
    .join("");
}

function readerSentenceLines(passages) {
  return passages.flatMap((line) => {
    const fragments = Array.isArray(line.sentences) && line.sentences.length ? line.sentences : [line];
    const englishSentences = splitReaderSentences(line.en);
    const translationsAlign = englishSentences.length === fragments.length;
    return fragments.map((fragment, index) => ({
      ...line,
      ...fragment,
      grammarMatches: Array.isArray(fragment.grammarMatchIds) || Array.isArray(fragment.grammarMatches)
        ? grammarMatchesForLine(fragment)
        : grammarMatchesForLine(line),
      structure: fragment.structure ?? readerSentenceStructure(fragment.si ?? line.si),
      en: translationsAlign ? englishSentences[index] : line.en,
      translationKey: line.translationKey,
      translationStatus: line.translationStatus,
      translationOrigin: line.translationOrigin,
      aiMarked: line.aiMarked,
      readerKey: fragment.readerKey ?? `${line.translationKey}:sentence-${index + 1}`,
      sentencePosition: fragments.length > 1 ? index + 1 : null,
      sentenceTotal: fragments.length
    }));
  });
}

function readerSentenceStructure(text) {
  const words = String(text ?? "")
    .split(/(\s+|[.,!?;:()[\]'"“”‘’]+)/)
    .map((token) => cleanToken(token))
    .filter((token) => token && hasSinhalaText(token));
  const pronouns = ["මම", "මං", "ඔයා", "එයා", "ඇය", "ඔහු", "අපි", "ඔවුන්", "කැරන්", "ජැක්", "ටොම්"];
  const endings = words
    .map((word) => {
      if (word.endsWith("ට")) return { word, role: "to/for marker (-ට)" };
      if (word.endsWith("ගේ")) return { word, role: "possessive marker (-ගේ)" };
      if (word.endsWith("ව")) return { word, role: "object marker (-ව)" };
      if (word.endsWith("න්")) return { word, role: "from/by marker (-න්)" };
      return null;
    })
    .filter(Boolean)
    .slice(0, 5);
  const connectors = words.filter((word) => ["ඉතින්", "ඒත්", "හැබැයි", "එතකොට", "මොකද"].includes(word));
  const negation = words.filter((word) => ["නැහැ", "නෑ", "බෑ", "එපා"].includes(word));
  const verb = [...words].reverse().find((word) => /(වා|වුණා|වුනා|ගියා|කළා|කරා|ගත්තා|හිටියා|තිබුණා|න්නේ|න්න)$/.test(word)) ?? "";
  const subject = words.find((word) => pronouns.includes(word) || word.endsWith("යා") || word.endsWith("යෙක්")) ?? "";
  return {
    likelyOrder: "Subject / setting / object / verb",
    parts: {
      connector: connectors,
      subject: subject ? [subject] : [],
      recipient: endings.filter((item) => item.role.includes("to/for")).map((item) => item.word),
      possessive: endings.filter((item) => item.role.includes("possessive")).map((item) => item.word),
      timePlace: words.filter((word) => /(දවස|රැය|ගම|ගෙදර|මෙහෙ|එතන|පස්සේ|වෙලාවේ|කාලෙක)/.test(word)).slice(0, 4),
      object: endings.filter((item) => item.role.includes("object")).map((item) => item.word),
      verb: verb ? [verb] : [],
      negation
    },
    finalVerb: verb,
    connectors,
    negation,
    endings
  };
}

function splitReaderSentences(text) {
  return String(text ?? "")
    .match(/[^.!?]+[.!?]?/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [];
}

function readerLine(line) {
  const status = translationStatusLabel(line);
  const readerKey = line.readerKey ?? line.translationKey;
  const translationVisible = Boolean(state.revealedTranslations[`story:${readerKey}:translation`]);
  const grammarVisible = Boolean(state.revealedTranslations[`story:${readerKey}:grammar`]);
  const match = primaryGrammarMatch(line);
  const rankLabel = match ? ` · Rank ${match.difficultyRank}: ${match.title}` : "";
  const sentenceLabel = line.sentencePosition ? ` · Sentence ${line.sentencePosition}/${line.sentenceTotal}` : "";
  return `<div class="reader-line">
    <div class="reader-line-head">
      <small>${escapeHtml(line.speaker)} ${line.time ? `· ${escapeHtml(line.time)}` : ""} · ${escapeHtml(status)}${escapeHtml(sentenceLabel)}${escapeHtml(rankLabel)}</small>
      <button class="copy-button" type="button" data-copy-line="${escapeHtml(`${line.si}\n${line.en}`)}">Copy</button>
    </div>
    <p class="reader-si">${renderTokens(line.si, line.en)}</p>
    ${grammarTagsHtml(line.tags)}
    <div class="reader-tools">
      <button class="small-action" type="button" data-story-toggle="translation" data-reader-key="${escapeHtml(readerKey)}">${translationVisible ? "Hide translation" : "Reveal translation"}</button>
      <button class="small-action" type="button" data-story-toggle="grammar" data-reader-key="${escapeHtml(readerKey)}">${grammarVisible ? "Hide grammar" : "Reveal grammar"}</button>
    </div>
    <div class="reader-support ${translationVisible ? "" : "hidden"}" data-story-panel="translation" data-reader-key="${escapeHtml(readerKey)}">
      <p class="reader-en">${escapeHtml(line.en)} ${translationBadge(line)}</p>
    </div>
    <div class="reader-support ${grammarVisible ? "" : "hidden"}" data-story-panel="grammar" data-reader-key="${escapeHtml(readerKey)}">
      ${structureHtml(line.structure)}
    </div>
  </div>`;
}

function vocabRow(item) {
  const alternatives = item.alternatives?.length ? ` · ${escapeHtml(item.alternatives.join(", "))}` : "";
  const displayTags = (item.tags ?? [])
    .filter((tag) => !tag.startsWith("lesson:"))
    .map((tag) => tag.replace(/^(kind|difficulty|topic|grammar|part-of-speech):/, ""));
  return `<div class="vocab-row"><strong>${escapeHtml(item.si)}</strong><span>${escapeHtml(item.en)}${alternatives}${grammarTagsHtml(displayTags)}</span></div>`;
}

function grammarTagsHtml(tags) {
  const uniqueTags = [...new Set((Array.isArray(tags) ? tags : []).filter(Boolean))];
  if (!uniqueTags.length) return "";
  return `<span class="grammar-tags">${uniqueTags.map((tag) => `<span class="grammar-tag">${escapeHtml(tag)}</span>`).join("")}</span>`;
}

function renderGrammar() {
  const level = levelById(state.currentGrammarLevel);
  const term = els.librarySearch.value.trim().toLowerCase();
  const content = els.libraryContentFilter.value || "all";
  const matches = (...values) => !term || values.flat(Infinity).filter(Boolean).join(" ").toLowerCase().includes(term);
  const topics = (state.data.course.referenceLessons ?? []).filter(
    (item) =>
      item.level === level.id &&
      matches(
        item.title,
        item.goal,
        item.vocabulary.map((word) => [word.si, word.en, word.tags]),
        item.phrases.map((phrase) => [phrase.si, phrase.en, phrase.tags]),
        item.conversation.map((turn) => [turn.si, turn.en, turn.tags]),
        studyGuideSearchText(item.studyGuide)
      )
  );
  const structures = state.data.course.grammarStructures.filter(
    (item) =>
      item.level === level.id &&
      matches(item.title, item.pattern, item.explanation, item.tags, item.examples.map((example) => [example.si, example.en, example.tags]))
  );
  const conversations = state.data.course.conversations.filter(
    (item) =>
      item.level === level.id &&
      matches(
        item.title,
        item.contextEn,
        item.tags,
        item.variants.map((variant) => [variant.aSi, variant.aEn, variant.replySi, variant.replyEn, variant.tags])
      )
  );
  els.grammarLessonSelect.value = level.id;
  els.librarySummary.innerHTML = `<strong>${topics.length} topics · ${structures.length} structures · ${conversations.length} conversations</strong><span>${escapeHtml(level.description)}</span>`;
  const showTopics = content === "all" || content === "topics";
  const showGrammar = content === "all" || content === "grammar";
  const showConversations = content === "all" || content === "conversations";
  const topicHtml = showTopics
    ? `<section class="library-section">
        <div class="library-section-heading"><div><p class="eyebrow">Compact course notes</p><h3>Topic lessons</h3></div><span>${topics.length}</span></div>
        <div class="reference-topic-list">
          ${topics.map(referenceTopicHtml).join("") || emptyLibraryMessage("No topic lessons match this search.")}
        </div>
      </section>`
    : "";
  const grammarHtml = showGrammar
    ? `<section class="library-section">
        <div class="library-section-heading"><div><p class="eyebrow">Sentence building</p><h3>Grammar structures</h3></div><span>${structures.length}</span></div>
        <div class="grammar-list">
          ${structures
            .map(
              (item) => `<article class="grammar-row">
                <div class="grammar-row-heading">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span class="rank-badge">Rank ${escapeHtml(item.difficultyRank ?? "?")}</span>
                </div>
                ${grammarTagsHtml(item.tags)}
                <p><b>Pattern:</b> ${escapeHtml(item.pattern)}</p>
                <p>${escapeHtml(item.explanation)}</p>
                <div class="phrase-family">
                  ${item.examples
                    .map(
                      (example) => `<div>
                        <p class="sinhala-example">${renderTokens(example.si, example.en)}</p>
                        <p>${escapeHtml(example.en)} ${translationBadge(example)} ${grammarTagsHtml(example.tags)}</p>
                      </div>`
                    )
                    .join("")}
                </div>
              </article>`
            )
            .join("") || emptyLibraryMessage("No grammar structures match this search.")}
        </div>
      </section>`
    : "";
  const conversationHtml = showConversations
    ? `<section class="library-section">
        <div class="library-section-heading"><div><p class="eyebrow">Speak in context</p><h3>Conversation models</h3></div><span>${conversations.length}</span></div>
        <div class="grammar-list">
          ${conversations
            .map(
              (item) => `<article class="grammar-row conversation-model">
                <strong>${escapeHtml(item.title)}</strong>
                ${grammarTagsHtml(item.tags)}
                <p>${escapeHtml(item.contextEn)}</p>
                <div class="phrase-family">
                  ${item.variants
                    .map(
                      (variant) => `<div>
                        <p class="sinhala-example">A: ${renderTokens(variant.aSi, variant.aEn)}</p>
                        <p>A: ${escapeHtml(variant.aEn)} ${translationBadge({ aiMarked: variant.aAiMarked })} ${grammarTagsHtml(variant.tags)}</p>
                        <p class="sinhala-example">B: ${renderTokens(variant.replySi, variant.replyEn)}</p>
                        <p>B: ${escapeHtml(variant.replyEn)} ${translationBadge({ aiMarked: variant.replyAiMarked })} ${grammarTagsHtml(variant.tags)}</p>
                      </div>`
                    )
                    .join("")}
                </div>
              </article>`
            )
            .join("") || emptyLibraryMessage("No conversation models match this search.")}
        </div>
      </section>`
    : "";
  const sourcesHtml = content === "all" && !term
    ? `<section class="library-section research-sources">
        <div class="library-section-heading"><div><p class="eyebrow">Course research</p><h3>Language sources</h3></div><span>${state.data.course.sources?.length ?? 0}</span></div>
        <div class="source-link-list">${(state.data.course.sources ?? [])
          .map(
            (source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(source.title)}</strong>
              <span>${escapeHtml(source.organization)} · ${escapeHtml(source.usedFor)}</span>
            </a>`
          )
          .join("")}</div>
      </section>`
    : "";
  els.grammarPanel.innerHTML = `
    <div class="note-band">
      <h2>${escapeHtml(level.title)}</h2>
      <p>${escapeHtml(level.description)} Expand a topic for bilingual notes, or review it as a short practice session.</p>
    </div>
    ${topicHtml}${grammarHtml}${conversationHtml}${sourcesHtml}`;
  els.grammarPanel.querySelectorAll("[data-review-reference]").forEach((button) => {
    button.addEventListener("click", () => startReferenceLesson(button.dataset.reviewReference));
  });
  els.grammarPanel.querySelectorAll("[data-copy-library]").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.copyLibrary, "text"));
  });
  els.grammarPanel.querySelectorAll("[data-verb-example]").forEach((button) => {
    button.addEventListener("click", () => {
      state.revealedTranslations[button.dataset.verbExample] = true;
      button.classList.add("translation-revealed");
      button.setAttribute("aria-expanded", "true");
      button.querySelector("small").textContent = button.dataset.verbExampleTranslation;
    });
  });
  bindWordLookups(els.grammarPanel);
}

function referenceTopicHtml(topic) {
  const reviewed = Boolean(state.progress.referencePractices[topic.id]);
  return `<details class="reference-topic" ${els.librarySearch.value.trim() ? "open" : ""}>
    <summary>
      <span class="reference-topic-number">${topic.number}</span>
      <span><strong>${escapeHtml(topic.title)}</strong><small>${escapeHtml(topic.goal)}</small></span>
      <span class="reference-topic-status">${reviewed ? "Reviewed" : `${topic.exercises.length} exercises`}</span>
    </summary>
    <div class="reference-topic-body">
      <div class="reference-topic-actions">
        <span class="pill">${escapeHtml(levelById(topic.level).title)}</span>
        <span class="pill">${topic.subLessons.length} short parts</span>
        <button class="small-action" type="button" data-review-reference="${escapeHtml(topic.id)}">${reviewed ? "Review again" : "Review topic"}</button>
      </div>
      <section class="reference-block">
        <h4>Grammar focus</h4>
        ${topic.grammarLessons.length
          ? topic.grammarLessons
              .map((grammar) => `<p><strong>${escapeHtml(grammar.title)}</strong><span>${escapeHtml(grammar.pattern)}</span></p>`)
              .join("")
          : `<p><strong>Verb forms</strong><span>Review the imported verb guide and form drills.</span></p>`}
      </section>
      ${studyGuideHtml(topic.studyGuide)}
      ${topic.vocabulary.length ? `<section class="reference-block">
        <h4>Words</h4>
        <div class="reference-vocab-grid">${topic.vocabulary
          .map(
            (word) => `<div class="reference-vocab-item"><strong>${renderTokens(word.si, word.en)}</strong><span>${escapeHtml(word.en)} ${translationBadge(word)} ${grammarTagsHtml(word.tags)}</span></div>`
          )
          .join("")}</div>
      </section>` : ""}
      ${topic.phrases.length ? `<section class="reference-block">
        <h4>Useful phrases</h4>
        ${topic.phrases
          .map(
            (phrase) => `<div class="reference-phrase"><div><p>${renderTokens(phrase.si, phrase.en)}</p><span>${escapeHtml(phrase.en)} ${translationBadge(phrase)} ${grammarTagsHtml(phrase.tags)}</span></div><button class="copy-button" type="button" data-copy-library="${escapeHtml(`${phrase.si}\n${phrase.en}`)}">Copy</button></div>`
          )
          .join("")}
      </section>` : ""}
      ${topic.conversation.length ? `<section class="reference-block">
        <h4>Mini conversation</h4>
        ${topic.conversation
          .map(
            (turn) => `<div class="reference-dialogue"><b>${escapeHtml(turn.speaker)}</b><div><p>${renderTokens(turn.si, turn.en)}</p><span>${escapeHtml(turn.en)} ${translationBadge(turn)} ${grammarTagsHtml(turn.tags)}</span></div><button class="copy-button" type="button" data-copy-library="${escapeHtml(`${turn.si}\n${turn.en}`)}">Copy</button></div>`
          )
          .join("")}
      </section>` : ""}
    </div>
  </details>`;
}

function studyGuideSearchText(studyGuide) {
  if (!studyGuide) return "";
  return [
    studyGuide.source,
    studyGuide.progressiveGuide
      ? [
          studyGuide.progressiveGuide.title,
          studyGuide.progressiveGuide.pattern,
          studyGuide.progressiveGuide.description,
          (studyGuide.progressiveGuide.examples ?? []).map((example) => [example.si, example.transliteration, example.en])
        ]
      : "",
    (studyGuide.rules ?? []).map((rule) => [rule.title, rule.description, rule.pattern, rule.example, rule.note]),
    (studyGuide.verbs ?? []).map((verb) => [
      verb.baseVerb,
      verb.transliteration,
      verb.meaning,
      (verb.forms ?? []).map((form) => [
        form.label,
        form.form,
        form.transliteration,
        form.function,
        (form.examples ?? []).map((example) => [example.si, example.transliteration, example.en])
      ])
    ])
  ];
}

function studyGuideHtml(studyGuide) {
  if (!studyGuide?.rules?.length && !studyGuide?.verbs?.length) return "";
  const ruleHtml = (studyGuide.rules ?? [])
    .map(
      (rule) => `<article class="verb-rule">
        <strong>${escapeHtml(rule.title)}</strong>
        <span>${escapeHtml(rule.pattern)}</span>
        <p>${escapeHtml(rule.description)}</p>
        ${rule.example ? `<small>Example: ${escapeHtml(rule.example)}</small>` : ""}
        ${rule.note ? `<small>${escapeHtml(rule.note)}</small>` : ""}
      </article>`
    )
    .join("");
  const progressiveGuide = studyGuide.progressiveGuide;
  const progressiveHtml = progressiveGuide
    ? `<article class="verb-rule verb-progressive-guide">
        <strong>${escapeHtml(progressiveGuide.title)}</strong>
        <span>${escapeHtml(progressiveGuide.pattern)}</span>
        <p>${escapeHtml(progressiveGuide.description)}</p>
        <ul>
          ${(progressiveGuide.examples ?? [])
            .map((example, index) => {
              const exampleDisplayKey = { reviewKey: `verb-progressive-guide:${index}` };
              const revealKey = `library-verb-progressive:${index}`;
              const revealed = Boolean(state.revealedTranslations[revealKey]);
              return `<li><button class="verb-example ${revealed ? "translation-revealed" : ""}" type="button" data-verb-example="${escapeHtml(revealKey)}" data-verb-example-translation="${escapeHtml(example.en)}" aria-expanded="${revealed}"><span>${practiceSinhalaHtml(example.si, example.en, exampleDisplayKey, { transliteration: example.transliteration, tokens: false })}</span><small aria-live="polite">${revealed ? escapeHtml(example.en) : "Tap for English translation"}</small></button></li>`;
            })
            .join("")}
        </ul>
      </article>`
    : "";
  const verbHtml = (studyGuide.verbs ?? [])
    .map(
      (verb, verbIndex) => {
        const verbDisplayKey = { reviewKey: `verb-guide:${verb.baseVerb}:${verbIndex}` };
        return `<details class="verb-guide-item">
        <summary><strong>${practiceSinhalaHtml(verb.baseVerb, verb.meaning, verbDisplayKey, { transliteration: verb.transliteration, tokens: false })}</strong><span>${escapeHtml(verb.meaning)}</span></summary>
        <div class="verb-form-grid">
          ${(verb.forms ?? [])
            .map((form, formIndex) => {
              const formDisplayKey = { reviewKey: `verb-guide:${verb.baseVerb}:${verbIndex}:${form.type}:${formIndex}` };
              return `<article class="verb-form-card">
                <div><strong>${escapeHtml(form.label)}</strong><b>${practiceSinhalaHtml(form.form, form.function, formDisplayKey, { transliteration: form.transliteration, tokens: false })}</b></div>
                <p>${escapeHtml(form.function)}</p>
                ${(form.examples ?? []).length ? `<ul>
                  ${(form.examples ?? [])
                    .map((example, exampleIndex) => {
                      const exampleDisplayKey = { reviewKey: `verb-guide:${verb.baseVerb}:${verbIndex}:${form.type}:${exampleIndex}` };
                      const revealKey = `library-verb-example:${verb.baseVerb}:${verbIndex}:${form.type}:${exampleIndex}`;
                      const revealed = Boolean(state.revealedTranslations[revealKey]);
                      return `<li><button class="verb-example ${revealed ? "translation-revealed" : ""}" type="button" data-verb-example="${escapeHtml(revealKey)}" data-verb-example-translation="${escapeHtml(example.en)}" aria-expanded="${revealed}"><span>${practiceSinhalaHtml(example.si, example.en, exampleDisplayKey, { transliteration: example.transliteration, tokens: false })}</span><small aria-live="polite">${revealed ? escapeHtml(example.en) : "Tap for English translation"}</small></button></li>`;
                    })
                    .join("")}
                  </ul>` : ""}
              </article>`;
            })
            .join("")}
        </div>
      </details>`;
      }
    )
    .join("");
  return `<section class="reference-block verb-study-guide">
    <h4>Verb study guide</h4>
    <div class="verb-rule-grid">${ruleHtml}${progressiveHtml}</div>
    <div class="verb-guide-list">${verbHtml}</div>
  </section>`;
}

function emptyLibraryMessage(message) {
  return `<div class="library-empty">${escapeHtml(message)}</div>`;
}

function initializeTranslations() {
  state.baseTranslations = {};
  state.curriculumTranslationEntries = [];
  for (const lesson of state.data.lessons) {
    for (const passage of lesson.passages) {
      passage.translationKind = "phrase";
      state.baseTranslations[passage.translationKey] = {
        en: passage.en,
        translationStatus: passage.translationStatus,
        translationOrigin: passage.translationOrigin,
        aiMarked: Boolean(passage.aiMarked)
      };
    }
  }
  initializeCurriculumTranslations();
  applyTranslationOverrides();
}

function initializeCurriculumTranslations() {
  const levelLessons = new Map(
    state.data.course.levels.map((level) => [level.id, { id: `curriculum-${level.id}`, title: `Curriculum · ${level.title}` }])
  );
  const addEntry = ({
    key,
    lesson,
    speaker,
    target,
    siField,
    enField,
    markerField,
    statusField,
    originField,
    kind = "phrase",
    defaultAiMarked = true,
    defaultStatus = defaultAiMarked ? "ai-translated" : "translated",
    defaultOrigin = defaultAiMarked ? "AI-authored curriculum" : "source notes"
  }) => {
    const line = {
      translationKey: key,
      si: target[siField],
      en: target[enField],
      speaker,
      time: "",
      translationKind: kind,
      aiMarked: Boolean(target[markerField] ?? defaultAiMarked),
      translationStatus: target[statusField] ?? defaultStatus,
      translationOrigin: target[originField] ?? defaultOrigin
    };
    state.baseTranslations[key] = {
      en: line.en,
      translationStatus: line.translationStatus,
      translationOrigin: line.translationOrigin,
      aiMarked: line.aiMarked
    };
    state.curriculumTranslationEntries.push({ lesson, line, target, enField, markerField, statusField, originField });
  };

  for (const lesson of state.data.lessons) {
    lesson.vocabulary.forEach((item) => {
      addEntry({
        key: item.translationKey,
        lesson,
        speaker: "Vocabulary note",
        target: item,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin",
        kind: item.kind === "phrase" ? "phrase" : "word",
        defaultAiMarked: false,
        defaultStatus: "translated",
        defaultOrigin: "source notes"
      });
    });
  }

  for (const item of state.data.course.grammarStructures) {
    item.examples.forEach((example, index) => {
      addEntry({
        key: example.translationKey,
        lesson: levelLessons.get(item.level),
        speaker: `Grammar · ${item.title} · phrase ${index + 1}`,
        target: example,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin"
      });
    });
  }

  for (const item of state.data.course.conversations) {
    const lesson = levelLessons.get(item.level);
    item.variants.forEach((variant, index) => {
      addEntry({
        key: variant.aTranslationKey,
        lesson,
        speaker: `Conversation · ${item.title} · phrase ${index + 1} · A`,
        target: variant,
        siField: "aSi",
        enField: "aEn",
        markerField: "aAiMarked",
        statusField: "aTranslationStatus",
        originField: "aTranslationOrigin"
      });
      addEntry({
        key: variant.replyTranslationKey,
        lesson,
        speaker: `Conversation · ${item.title} · phrase ${index + 1} · B`,
        target: variant,
        siField: "replySi",
        enField: "replyEn",
        markerField: "replyAiMarked",
        statusField: "replyTranslationStatus",
        originField: "replyTranslationOrigin"
      });
    });
    item.distractors.forEach((distractor, index) => {
      addEntry({
        key: `curriculum:conversation:${item.id}:distractor-${index + 1}`,
        lesson,
        speaker: `Conversation · ${item.title} · alternative ${index + 1}`,
        target: distractor,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin"
      });
    });
  }

  for (const pack of state.data.course.vocabularyPacks) {
    const lesson = { id: `vocabulary-${pack.id}`, title: `Vocabulary · ${pack.title}` };
    pack.items.forEach((item) => {
      addEntry({
        key: item.translationKey,
        lesson,
        speaker: `Expansion word · ${pack.title}`,
        target: item,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin",
        kind: "word",
        defaultAiMarked: true,
        defaultStatus: "ai-translated",
        defaultOrigin: "AI-authored expansion"
      });
    });
  }

  for (const topic of state.data.course.referenceLessons ?? []) {
    topic.vocabulary.forEach((item) => {
      addEntry({
        key: item.translationKey,
        lesson: topic,
        speaker: `Course topic · ${topic.title} · word`,
        target: item,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin",
        kind: "word",
        defaultOrigin: "AI-authored course library"
      });
    });
    topic.phrases.forEach((item) => {
      addEntry({
        key: item.translationKey,
        lesson: topic,
        speaker: `Course topic · ${topic.title} · useful phrase`,
        target: item,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin",
        defaultOrigin: "AI-authored course library"
      });
    });
    topic.conversation.forEach((item) => {
      addEntry({
        key: item.translationKey,
        lesson: topic,
        speaker: `Course topic · ${topic.title} · dialogue ${item.speaker}`,
        target: item,
        siField: "si",
        enField: "en",
        markerField: "aiMarked",
        statusField: "translationStatus",
        originField: "translationOrigin",
        defaultOrigin: "AI-authored course library"
      });
    });
  }
}

function sentenceTokensForBuild(value) {
  return String(value ?? "")
    .replace(/[.,!?;:()[\]{}"“”‘’]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function syncSentenceBuildTranslation(exercise, line) {
  if (exercise.type !== "sentence_build") return;
  exercise.si = line.si;
  exercise.en = line.en;
  exercise.translation = line.en;
  exercise.translationStatus = line.translationStatus;
  exercise.aiMarked = Boolean(line.aiMarked);
  exercise.prompt = exercise.direction === "en_to_si" ? line.en : line.si;
  exercise.answerTokens = sentenceTokensForBuild(exercise.direction === "en_to_si" ? line.si : line.en);
  exercise.answer = exercise.answerTokens.join(" ");
  const answerSet = new Set(exercise.answerTokens.map((token) => token.toLocaleLowerCase()));
  const distractors = (exercise.distractorTokens ?? []).filter(
    (token) => !answerSet.has(token.toLocaleLowerCase())
  );
  exercise.wordBank = [...exercise.answerTokens, ...distractors];
  if (exercise.sessionChoices) exercise.sessionChoices = shuffleRandom(exercise.wordBank);
}

function applyTranslationOverrides() {
  const passagesByKey = new Map();
  for (const lesson of state.data.lessons) {
    for (const passage of lesson.passages) {
      const base = state.baseTranslations[passage.translationKey];
      if (base) Object.assign(passage, base);
      const override = state.translationOverrides[passage.translationKey];
      if (override?.en) {
        passage.en = override.en;
        passage.aiMarked = Boolean(override.aiMarked);
        passage.translationStatus = passage.aiMarked ? "ai-translated" : "reviewed";
        passage.translationOrigin = "Your saved edit";
      }
      passagesByKey.set(passage.translationKey, passage);
    }
    for (const exercise of [...lesson.exercises, ...(lesson.storyExercises ?? [])]) {
      const passage = passagesByKey.get(exercise.translationKey);
      if (!passage) continue;
      if (exercise.type === "sentence_build") syncSentenceBuildTranslation(exercise, passage);
      else {
        exercise.translation = passage.en;
        exercise.translationStatus = passage.translationStatus;
        exercise.aiMarked = passage.aiMarked;
      }
    }
  }
  for (const lesson of state.data.courseLessons) {
    const exercises = [
      lesson.exercises,
      lesson.variationPool ?? [],
      ...(lesson.subLessons ?? []).map((subLesson) => subLesson.exercises)
    ].flat();
    for (const exercise of exercises) {
      const passage = passagesByKey.get(exercise.translationKey);
      if (!passage) continue;
      if (exercise.type === "sentence_build") syncSentenceBuildTranslation(exercise, passage);
      else {
        exercise.translation = passage.en;
        exercise.translationStatus = passage.translationStatus;
        exercise.aiMarked = passage.aiMarked;
      }
    }
  }
  for (const exercise of [...(state.data.course.reviewExercises ?? []), ...state.sessionExercises]) {
    const passage = passagesByKey.get(exercise.translationKey);
    if (passage) syncSentenceBuildTranslation(exercise, passage);
  }
  for (const entry of state.curriculumTranslationEntries) {
    const base = state.baseTranslations[entry.line.translationKey];
    Object.assign(entry.line, base);
    const override = state.translationOverrides[entry.line.translationKey];
    if (override?.en) {
      entry.line.en = override.en;
      entry.line.aiMarked = Boolean(override.aiMarked);
      entry.line.translationStatus = entry.line.aiMarked ? "ai-translated" : "reviewed";
      entry.line.translationOrigin = "Your saved edit";
    }
    entry.target[entry.enField] = entry.line.en;
    entry.target[entry.markerField] = entry.line.aiMarked;
    entry.target[entry.statusField] = entry.line.translationStatus;
    entry.target[entry.originField] = entry.line.translationOrigin;
  }
  syncCurriculumExercises();
}

function syncCurriculumExercises() {
  const grammarById = new Map(state.data.course.grammarStructures.map((item) => [item.id, item]));
  const conversationById = new Map(state.data.course.conversations.map((item) => [item.id, item]));
  const curriculumLineByKey = new Map(state.curriculumTranslationEntries.map((entry) => [entry.line.translationKey, entry.line]));
  for (const set of state.data.course.wordPracticeSets ?? []) {
    set.items.forEach((item) => {
      const line = curriculumLineByKey.get(item.translationKey);
      if (!line) return;
      item.si = line.si;
      item.en = line.en;
      item.aiMarked = line.aiMarked;
      item.translationStatus = line.translationStatus;
      item.translationOrigin = line.translationOrigin;
    });
  }
  const syncChoice = (choice) => {
    const line = curriculumLineByKey.get(choice.translationKey);
    if (!line) return;
    choice.en = line.en;
    choice.aiMarked = line.aiMarked;
  };
  const syncVocabularyExercise = (exercise) => {
    const answerLine = curriculumLineByKey.get(exercise.answerTranslationKey);
    if (answerLine) {
      exercise.answer = answerLine.en;
      exercise.aiMarked = answerLine.aiMarked;
    }
    exercise.choiceTranslations?.forEach((choice) => {
      const line = curriculumLineByKey.get(choice.translationKey);
      if (!line) return;
      choice.en = line.en;
      choice.aiMarked = line.aiMarked;
    });
    if (exercise.choiceTranslations?.length) {
      exercise.choices = exercise.choiceTranslations.map((choice) => choice.en);
      if (exercise.sessionChoices) exercise.sessionChoices = shuffleRandom(exercise.choices);
    }
    exercise.pairs?.forEach((pair) => {
      const line = curriculumLineByKey.get(pair.translationKey);
      if (!line) return;
      pair.en = line.en;
      pair.aiMarked = line.aiMarked;
    });
  };
  for (const grammar of grammarById.values()) {
    const source = grammar.examples[0];
    grammar.exampleSi = source.si;
    grammar.exampleEn = source.en;
    grammar.exampleAiMarked = source.aiMarked;
  }
  for (const conversation of conversationById.values()) {
    const source = conversation.variants[0];
    conversation.aSi = source.aSi;
    conversation.aEn = source.aEn;
    conversation.aAiMarked = source.aAiMarked;
    conversation.replySi = source.replySi;
    conversation.replyEn = source.replyEn;
    conversation.replyAiMarked = source.replyAiMarked;
  }
  const exerciseGroups = [
    ...state.data.lessons.flatMap((lesson) => [lesson.exercises, lesson.storyExercises ?? []]),
    state.data.course.reviewExercises ?? [],
    ...(state.data.course.referenceLessons ?? []).flatMap((lesson) => [
      lesson.exercises,
      lesson.reviewExercises ?? [],
      ...(lesson.subLessons ?? []).map((part) => part.exercises)
    ]),
    ...state.data.courseLessons.flatMap((lesson) => [
      lesson.exercises,
      lesson.variationPool ?? [],
      ...(lesson.subLessons ?? []).map((part) => part.exercises)
    ]),
    state.sessionExercises
  ];
  for (const exercise of exerciseGroups.flat()) {
    const directLine = curriculumLineByKey.get(exercise.translationKey);
    if (directLine) {
      if (exercise.type === "sentence_build") syncSentenceBuildTranslation(exercise, directLine);
      else {
        exercise.translation = directLine.en;
        exercise.translationStatus = directLine.translationStatus;
        exercise.aiMarked = directLine.aiMarked;
      }
    }
    if (["choice", "matching"].includes(exercise.type)) syncVocabularyExercise(exercise);
    if (exercise.type === "word_choice") {
      const promptLine = curriculumLineByKey.get(exercise.translationKey);
      if (promptLine) {
        exercise.promptSi = promptLine.si;
        exercise.promptEn = promptLine.en;
        exercise.prompt = exercise.direction === "en_to_si" ? promptLine.en : promptLine.si;
        exercise.answer = exercise.direction === "en_to_si" ? promptLine.si : promptLine.en;
        exercise.aiMarked = promptLine.aiMarked;
        exercise.translationStatus = promptLine.translationStatus;
      }
      exercise.choiceItems?.forEach((choice) => {
        const line = curriculumLineByKey.get(choice.translationKey);
        if (!line) return;
        choice.si = line.si;
        choice.en = line.en;
        choice.aiMarked = line.aiMarked;
        choice.value = exercise.direction === "en_to_si" ? line.si : line.en;
      });
      if (exercise.choiceItems?.length) {
        exercise.sessionChoices = exercise.choiceItems.map((choice) => choice.value);
      }
    }
    if (exercise.type === "grammar_choice") {
      const grammar = grammarById.get(exercise.grammarId);
      if (!grammar) continue;
      exercise.variants.forEach((variant) => {
        const exampleLine = curriculumLineByKey.get(variant.exampleTranslationKey);
        if (exampleLine) {
          variant.exampleEn = exampleLine.en;
          variant.exampleAiMarked = exampleLine.aiMarked;
        }
        variant.choices.forEach(syncChoice);
      });
      const active = exercise.variants.find((variant) => variant.variantId === exercise.activeVariantId) ?? exercise.variants[0];
      Object.assign(exercise, active);
      exercise.choices.forEach(syncChoice);
      exercise.sessionChoices?.forEach(syncChoice);
    }
    if (["conversation_choice", "conversation_response"].includes(exercise.type)) {
      const conversation = conversationById.get(exercise.conversationId);
      if (!conversation) continue;
      exercise.variants.forEach((variant) => {
        const aLine = curriculumLineByKey.get(variant.aTranslationKey);
        const answerLine = curriculumLineByKey.get(variant.answerTranslationKey);
        if (aLine) {
          variant.aEn = aLine.en;
          variant.aAiMarked = aLine.aiMarked;
        }
        if (answerLine) {
          variant.answerEn = answerLine.en;
          variant.replyAiMarked = answerLine.aiMarked;
          variant.sample = `${variant.answer} = ${answerLine.en}`;
        }
        variant.choices?.forEach(syncChoice);
      });
      const active = exercise.variants.find((variant) => variant.variantId === exercise.activeVariantId) ?? exercise.variants[0];
      Object.assign(exercise, active);
      exercise.choices?.forEach(syncChoice);
      exercise.sessionChoices?.forEach(syncChoice);
    }
  }
  state.reviewBank = null;
}

function translationItems() {
  return [
    ...state.data.lessons.flatMap((lesson) => lesson.passages.map((line) => ({ lesson, line }))),
    ...state.curriculumTranslationEntries.map(({ lesson, line }) => ({ lesson, line }))
  ];
}

function renderTranslationEditor() {
  if (!state.data) return;
  const selectedLesson = els.translationLessonFilter.value || "all";
  const allItems = translationItems();
  const translationLessons = [...new Map(allItems.map(({ lesson }) => [lesson.id, lesson])).values()];
  if (els.translationLessonFilter.options.length !== translationLessons.length + 1) {
    els.translationLessonFilter.innerHTML = `<option value="all">All lessons</option>${translationLessons
      .map((lesson) => `<option value="${escapeHtml(lesson.id)}">${escapeHtml(lesson.title)}</option>`)
      .join("")}`;
    els.translationLessonFilter.value = translationLessons.some((lesson) => lesson.id === selectedLesson) ? selectedLesson : "all";
  }

  const term = els.translationSearch.value.trim().toLowerCase();
  const kind = els.translationKindFilter.value || "word";
  const status = els.translationStatusFilter.value || "ai";
  const filtered = allItems.filter(({ lesson, line }) => {
    const matchesLesson = selectedLesson === "all" || lesson.id === selectedLesson;
    const matchesTerm = !term || `${lesson.title} ${line.speaker} ${line.si} ${line.en}`.toLowerCase().includes(term);
    const matchesKind = kind === "all" || line.translationKind === kind;
    const matchesStatus =
      status === "all" ||
      (status === "ai" && line.aiMarked) ||
      (status === "pending" && line.translationStatus === "draft-gloss") ||
      (status === "reviewed" && line.translationStatus === "reviewed") ||
      (status === "source" && line.translationStatus === "translated");
    return matchesLesson && matchesTerm && matchesKind && matchesStatus;
  });

  const wordCount = allItems.filter(({ line }) => line.translationKind === "word").length;
  const phraseCount = allItems.length - wordCount;
  const aiCount = allItems.filter(({ line }) => line.aiMarked).length;
  const reviewedCount = allItems.filter(({ line }) => line.translationStatus === "reviewed").length;
  const pendingCount = allItems.filter(({ line }) => line.translationStatus === "draft-gloss").length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / state.translationPageSize));
  state.translationPage = Math.min(state.translationPage, pageCount - 1);
  const pageItems = filtered.slice(
    state.translationPage * state.translationPageSize,
    (state.translationPage + 1) * state.translationPageSize
  );

  els.translationSummary.innerHTML = `
    <strong>${filtered.length} shown</strong>
    <span>${wordCount} words · ${phraseCount} phrases · ${aiCount} AI* to review · ${reviewedCount} approved or edited · ${pendingCount} pending</span>
    ${state.translationMessage ? `<span class="translation-message">${escapeHtml(state.translationMessage)}</span>` : ""}`;
  els.translationList.innerHTML = pageItems.length
    ? pageItems.map(({ lesson, line }) => translationEditorRow(lesson, line)).join("")
    : `<div class="note-band"><h3>No translations match these filters.</h3><p>Try another lesson or status.</p></div>`;
  els.translationPager.innerHTML = `
    <button class="small-action" type="button" data-page="previous" ${state.translationPage === 0 ? "disabled" : ""}>Previous</button>
    <span>Page ${state.translationPage + 1} of ${pageCount}</span>
    <button class="small-action" type="button" data-page="next" ${state.translationPage + 1 >= pageCount ? "disabled" : ""}>Next</button>`;

  bindTranslationEditorEvents();
  bindWordLookups(els.translationList);
}

function translationEditorRow(lesson, line) {
  const hasOverride = Boolean(state.translationOverrides[line.translationKey]);
  const isWord = line.translationKind === "word";
  return `<article class="translation-editor-row" data-translation-row="${escapeHtml(line.translationKey)}">
    <div class="translation-row-head">
      <div>
        <strong>${escapeHtml(lesson.title)}</strong>
        <small>${escapeHtml(line.speaker)}${line.time ? ` · ${escapeHtml(line.time)}` : ""} · ${isWord ? "Word" : "Phrase"} · ${escapeHtml(translationStatusLabel(line))}</small>
      </div>
      ${translationBadge(line)}
    </div>
    <p class="reader-si">${renderTokens(line.si, line.en)}</p>
    <label class="translation-field">
      <span>${isWord ? "English meaning" : "English translation"}</span>
      <textarea rows="3" data-translation-input="${escapeHtml(line.translationKey)}">${escapeHtml(line.en)}</textarea>
    </label>
    <label class="marker-toggle">
      <input type="checkbox" data-ai-toggle="${escapeHtml(line.translationKey)}" ${line.aiMarked ? "checked" : ""}>
      <span>Keep the AI* marker</span>
    </label>
    <div class="translation-row-actions">
      <button class="small-action" type="button" data-save-translation="${escapeHtml(line.translationKey)}">Save</button>
      <button class="small-action approve-action" type="button" data-approve-translation="${escapeHtml(line.translationKey)}" ${line.aiMarked ? "" : "disabled"}>Approve and remove AI*</button>
      <button class="copy-button" type="button" data-reset-translation="${escapeHtml(line.translationKey)}" ${hasOverride ? "" : "disabled"}>Reset edit</button>
    </div>
  </article>`;
}

function bindTranslationEditorEvents() {
  els.translationList.querySelectorAll("[data-save-translation]").forEach((button) => {
    button.addEventListener("click", () => saveTranslationRow(button.dataset.saveTranslation, false));
  });
  els.translationList.querySelectorAll("[data-approve-translation]").forEach((button) => {
    button.addEventListener("click", () => saveTranslationRow(button.dataset.approveTranslation, true));
  });
  els.translationList.querySelectorAll("[data-reset-translation]").forEach((button) => {
    button.addEventListener("click", () => resetTranslationEdit(button.dataset.resetTranslation));
  });
  els.translationPager.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.translationPage += button.dataset.page === "next" ? 1 : -1;
      renderTranslationEditor();
      document.querySelector("#translationsView").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function saveTranslationRow(key, approve) {
  const row = els.translationList.querySelector(`[data-translation-row="${key}"]`);
  const input = row?.querySelector("[data-translation-input]");
  const marker = row?.querySelector("[data-ai-toggle]");
  const en = input?.value.trim();
  if (!en) {
    input?.setCustomValidity("Enter an English translation before saving.");
    input?.reportValidity();
    return;
  }
  input.setCustomValidity("");
  state.translationOverrides[key] = {
    en,
    aiMarked: approve ? false : Boolean(marker?.checked),
    updatedAt: new Date().toISOString()
  };
  state.translationMessage = approve ? "Translation approved and AI* removed." : "Translation saved.";
  saveTranslationOverrides();
  refreshTranslationViews();
}

function resetTranslationEdit(key) {
  delete state.translationOverrides[key];
  state.translationMessage = "Your edit was reset to the generated translation.";
  saveTranslationOverrides();
  refreshTranslationViews();
}

function refreshTranslationViews() {
  applyTranslationOverrides();
  state.sessionKey = "";
  state.sessionExercises = [];
  state.answer = null;
  renderTranslationEditor();
  renderScripts();
  renderGrammar();
  renderWords();
  renderPractice();
  renderPath();
  renderStats();
}

function translationBadge(item) {
  return item?.aiMarked
    ? `<span class="ai-badge" title="Machine translated. Review this in Translations.">AI*</span>`
    : "";
}

function translationStatusLabel(item) {
  if (item.translationStatus === "reviewed") return "Reviewed by you";
  if (item.aiMarked || item.translationStatus === "ai-translated") return "AI translation";
  if (item.translationStatus === "translated") return "From script notes";
  return "Translation pending";
}

function exportTranslationEdits() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    overrides: state.translationOverrides
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sinhala-translation-edits-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.translationMessage = `${Object.keys(state.translationOverrides).length} saved edits exported.`;
  renderTranslationEditor();
}

async function importTranslationEdits(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const imported = payload.overrides ?? payload;
    const valid = Object.fromEntries(
      Object.entries(imported).filter(([, value]) => value && typeof value.en === "string" && value.en.trim())
    );
    state.translationOverrides = { ...state.translationOverrides, ...valid };
    state.translationMessage = `${Object.keys(valid).length} translation edits imported.`;
    saveTranslationOverrides();
    refreshTranslationViews();
  } catch {
    state.translationMessage = "That file could not be imported. Choose a translation edits JSON file.";
    renderTranslationEditor();
  } finally {
    event.target.value = "";
  }
}

function renderStats() {
  const stats = state.data.stats;
  const completed = state.data.courseLessons.filter((lesson) => state.progress.lessons[lesson.id]).length;
  const attempts = state.progress.attempts;
  const accuracy = attempts ? Math.round((state.progress.correct / attempts) * 100) : 0;
  const dueReviews = Object.values(state.progress.reviewItems).filter((item) => new Date(item.dueAt).getTime() <= Date.now()).length;
  els.statsGrid.innerHTML = `
    <div class="stat"><strong>${stats.filesScanned}</strong><span>Markdown files scanned</span></div>
    <div class="stat"><strong>${stats.lessonsCreated}</strong><span>Source lessons scanned</span></div>
    <div class="stat"><strong>${stats.importedLessonFiles ?? 0}</strong><span>Imported lesson files</span></div>
    <div class="stat"><strong>${stats.importedJsonFiles ?? 0}</strong><span>Imported JSON files</span></div>
    <div class="stat"><strong>${stats.courseLessons}</strong><span>Numbered course lessons</span></div>
    <div class="stat"><strong>${stats.grammarStructures}</strong><span>Grammar structures</span></div>
    <div class="stat"><strong>${stats.grammarPhraseVariants}</strong><span>Grammar phrases</span></div>
    <div class="stat"><strong>${stats.conversationScenarios}</strong><span>Conversation scenarios</span></div>
    <div class="stat"><strong>${stats.conversationVariants}</strong><span>Conversation variations</span></div>
    <div class="stat"><strong>${stats.referenceLessons ?? 0}</strong><span>Course library topics</span></div>
    <div class="stat"><strong>${stats.importedReferenceLessons ?? 0}</strong><span>Imported topic lessons</span></div>
    <div class="stat"><strong>${stats.importedVerbLessons ?? 0}</strong><span>Verb guide lessons</span></div>
    <div class="stat"><strong>${stats.importedVerbCount ?? 0}</strong><span>Imported verbs</span></div>
    <div class="stat"><strong>${stats.importedVerbFormItems ?? 0}</strong><span>Verb form drill items</span></div>
    <div class="stat"><strong>${stats.referenceVocabulary ?? 0}</strong><span>Course library words</span></div>
    <div class="stat"><strong>${stats.sentenceBuildCards ?? 0}</strong><span>Sentence-building cards</span></div>
    <div class="stat"><strong>${stats.expansionVocabulary}</strong><span>Expansion/imported words</span></div>
    <div class="stat"><strong>${stats.wordPracticeSets ?? 0}</strong><span>Word drill sets</span></div>
    <div class="stat"><strong>${stats.wordPracticeItems ?? 0}</strong><span>Word drill items</span></div>
    <div class="stat"><strong>${stats.vocabularyItems}</strong><span>Vocabulary cards found</span></div>
    <div class="stat"><strong>${stats.taggedSourceVocabularyItems ?? 0}</strong><span>Tagged story words and phrases</span></div>
    <div class="stat"><strong>${stats.passages}</strong><span>Immersion lines available</span></div>
    <div class="stat"><strong>${stats.sourceTranslatedPassages ?? stats.translatedPassages}</strong><span>Translations from script notes</span></div>
    <div class="stat"><strong>${translationItems().filter(({ line }) => line.aiMarked).length}</strong><span>AI* translations to review</span></div>
    <div class="stat"><strong>${translationItems().filter(({ line }) => line.translationStatus === "reviewed").length}</strong><span>Translations you approved</span></div>
    <div class="stat"><strong>${translationItems().filter(({ line }) => line.translationStatus === "draft-gloss").length}</strong><span>Translations still pending</span></div>`;
  els.progressPanel.innerHTML = `
    <div class="note-band">
      <h2>Your Progress</h2>
      <p>${completed} lessons completed · ${state.progress.totalXp} XP · ${accuracy}% practice accuracy · next recommendation: ${escapeHtml(nextRecommendedLesson()?.title ?? "free review")}</p>
    </div>
    <div class="stats-grid">
      <div class="stat"><strong>${state.progress.exerciseStats.choice ?? 0}</strong><span>Vocab choices</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.matching ?? 0}</strong><span>Matching checks</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.fill_blank ?? 0}</strong><span>Fill blanks</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.sentence_build ?? 0}</strong><span>Sentences built</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.structure ?? 0}</strong><span>Grammar reveals</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.grammar_choice ?? 0}</strong><span>Grammar checks</span></div>
      <div class="stat"><strong>${(state.progress.exerciseStats.conversation_choice ?? 0) + (state.progress.exerciseStats.conversation_response ?? 0)}</strong><span>Conversation reps</span></div>
      <div class="stat"><strong>${state.progress.exerciseStats.speaking ?? 0}</strong><span>Speaking reps</span></div>
      <div class="stat"><strong>${Object.keys(state.progress.reviewItems).length}</strong><span>Concepts in review</span></div>
      <div class="stat"><strong>${dueReviews}</strong><span>Reviews due</span></div>
      <div class="stat"><strong>${Object.keys(state.progress.wordPractices).length}</strong><span>Word drills finished</span></div>
      <div class="stat"><strong>${Object.keys(state.progress.storyPractices).length}</strong><span>Story practices</span></div>
      <div class="stat"><strong>${Object.keys(state.progress.referencePractices).length}</strong><span>Topic reviews</span></div>
      <div class="stat"><strong>${state.progress.vocabClicks}</strong><span>Word lookups</span></div>
      <div class="stat"><strong>${state.progress.copiedLines}</strong><span>Copies</span></div>
      <div class="stat"><strong>${state.progress.readerOpens}</strong><span>Story reads</span></div>
      <div class="stat"><strong>${Math.round((state.settings.transliterationRate ?? 0) * 100)}%</strong><span>Transliteration rate</span></div>
    </div>`;
}

function renderTokens(text, contextTranslation = "") {
  return text
    .split(/(\s+|[.,!?;:()[\]'"“”‘’]+)/)
    .filter(Boolean)
    .map((token) => {
      if (!/[\u0D80-\u0DFF]/.test(token)) return escapeHtml(token);
      return `<button class="word-token" type="button" data-word="${escapeHtml(cleanToken(token))}" data-context="${escapeHtml(contextTranslation)}">${escapeHtml(token)}</button>`;
    })
    .join("");
}

function bindWordLookups(root) {
  root.querySelectorAll(".word-token").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showLookup(button, button.dataset.word);
    });
  });
}

function showLookup(button, word) {
  const matches = lookupWord(word);
  const contextTranslation = button.dataset.context;
  state.progress.vocabClicks += 1;
  saveProgress();
  const rect = button.getBoundingClientRect();
  const viewportPadding = 12;
  const estimatedPopoverHeight = 160;
  const estimatedPopoverWidth = 292;
  const minTop = window.scrollY + viewportPadding;
  const maxTop = window.scrollY + window.innerHeight - estimatedPopoverHeight;
  const minLeft = window.scrollX + viewportPadding;
  const maxLeft = window.scrollX + window.innerWidth - estimatedPopoverWidth;
  els.lookupPopover.hidden = false;
  els.lookupPopover.style.top = `${Math.max(minTop, Math.min(maxTop, rect.bottom + window.scrollY + 8))}px`;
  els.lookupPopover.style.left = `${Math.max(minLeft, Math.min(maxLeft, rect.left + window.scrollX))}px`;
  els.lookupPopover.innerHTML = matches.length
    ? `<strong>${escapeHtml(word)}</strong>${matches.map((item) => `<p>${escapeHtml(item.si)} = ${escapeHtml(item.en)}</p>`).join("")}<button class="copy-button" type="button" data-pop-copy="${escapeHtml(word)}">Copy word</button>`
    : `<strong>${escapeHtml(word)}</strong><p>${contextTranslation ? `Line meaning: ${escapeHtml(contextTranslation)}` : "No standalone glossary match yet."}</p><button class="copy-button" type="button" data-pop-copy="${escapeHtml(word)}">Copy word</button>`;
  els.lookupPopover.querySelector("[data-pop-copy]").addEventListener("click", () => copyText(word, "word"));
}

function closeLookup() {
  els.lookupPopover.hidden = true;
}

function lookupWord(word) {
  const clean = cleanToken(word);
  const all = [
    ...state.data.lessons.flatMap((lesson) => lesson.vocabulary),
    ...state.data.course.vocabularyPacks.flatMap((pack) => pack.items),
    ...(state.data.course.referenceLessons ?? []).flatMap((lesson) => lesson.vocabulary)
  ];
  const exact = all.filter((item) => cleanToken(item.si) === clean);
  if (exact.length) return dedupeVocab(exact).slice(0, 4);
  return dedupeVocab(all.filter((item) => cleanToken(item.si).includes(clean) || clean.includes(cleanToken(item.si)))).slice(0, 4);
}

function dedupeVocab(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.si}:${item.en}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function copyText(text, kind) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  state.progress.copiedLines += 1;
  saveProgress();
  renderStats();
  if (kind) {
    els.lookupPopover.hidden = false;
    els.lookupPopover.style.top = `${window.scrollY + 16}px`;
    els.lookupPopover.style.left = "12px";
    els.lookupPopover.innerHTML = `<strong>Copied ${escapeHtml(kind)}</strong>`;
    setTimeout(closeLookup, 1200);
  }
}

function currentSessionExercises(lesson) {
  const key = `${state.practiceMode}:${lesson.id}`;
  if (state.sessionKey !== key || !state.sessionExercises.length) prepareSession(lesson, key);
  return state.sessionExercises;
}

function courseRoundSubLessons(lesson) {
  const target = lesson.roundQuestionTarget ?? 10;
  const coreSubLessons = lesson.subLessons ?? [];
  const pool = lesson.variationPool?.length ? lesson.variationPool : lesson.exercises ?? [];
  const selectedKeys = new Set();
  const selectedByKind = new Map(coreSubLessons.map((part) => [part.kind, []]));
  const kindSequence = [
    "warmup",
    "grammar",
    "conversation",
    "immersion",
    "warmup",
    "grammar",
    "conversation",
    "immersion",
    "immersion",
    "warmup",
    "grammar",
    "conversation"
  ];
  const addExercise = (kind, candidates) => {
    const group = selectedByKind.get(kind) ?? [];
    const prioritized = shuffleRandom(candidates).sort(
      (a, b) => Number(Boolean(b.topicAligned)) - Number(Boolean(a.topicAligned))
    );
    for (const exercise of prioritized) {
      const key = `${exercise.type}:${exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id)}`;
      if (selectedKeys.has(key)) continue;
      selectedKeys.add(key);
      group.push(exercise);
      selectedByKind.set(kind, group);
      return true;
    }
    return false;
  };
  for (const part of coreSubLessons) {
    const partCandidates = pool.filter((exercise) => exercise.subLessonKind === part.kind);
    if (part.kind === "immersion") {
      addExercise(part.kind, partCandidates.filter((exercise) => exercise.courseRole === "source-immersion"));
    } else {
      addExercise(part.kind, partCandidates.filter((exercise) => exercise.topicAligned));
      if (!(selectedByKind.get(part.kind) ?? []).length) {
        addExercise(part.kind, pool.filter((exercise) => exercise.topicAligned));
      }
    }
    if (!(selectedByKind.get(part.kind) ?? []).length) addExercise(part.kind, partCandidates);
  }
  for (const kind of kindSequence) {
    const total = [...selectedByKind.values()].reduce((sum, items) => sum + items.length, 0);
    if (total >= target) break;
    const partCandidates = pool.filter((exercise) => exercise.subLessonKind === kind);
    if (!addExercise(kind, partCandidates.filter((exercise) => exercise.topicAligned))) {
      if (!addExercise(kind, pool.filter((exercise) => exercise.topicAligned))) {
        if (!addExercise(kind, partCandidates)) addExercise(kind, pool);
      }
    }
  }
  const selectedTotal = [...selectedByKind.values()].reduce((sum, items) => sum + items.length, 0);
  if (selectedTotal < target) {
    for (const exercise of shuffleRandom(pool)) {
      const kind = exercise.subLessonKind ?? "immersion";
      if (addExercise(kind, [exercise]) && [...selectedByKind.values()].reduce((sum, items) => sum + items.length, 0) >= target) break;
    }
  }
  return coreSubLessons
    .map((part) => ({
      ...part,
      exercises: selectedByKind.get(part.kind) ?? []
    }))
    .filter((part) => part.exercises.length);
}

function trimCourseSubLessons(subLessons, target) {
  const total = subLessons.reduce((sum, part) => sum + part.exercises.length, 0);
  if (total <= target) return subLessons;
  const keptByPart = new Map(subLessons.map((part) => [part.id, []]));
  const selectedKeys = new Set();
  const add = (part, exercise) => {
    const key = `${exercise.type}:${exercise.reviewKey ?? runtimeReviewKey(exercise, part.id)}`;
    if (selectedKeys.has(key)) return false;
    selectedKeys.add(key);
    keptByPart.get(part.id).push(exercise);
    return true;
  };
  for (const part of subLessons) {
    if (part.exercises[0]) add(part, part.exercises[0]);
  }
  for (const part of subLessons) {
    for (const exercise of part.exercises.slice(1)) {
      const keptTotal = [...keptByPart.values()].reduce((sum, items) => sum + items.length, 0);
      if (keptTotal >= target) break;
      add(part, exercise);
    }
  }
  return subLessons
    .map((part) => ({ ...part, exercises: keptByPart.get(part.id) ?? [] }))
    .filter((part) => part.exercises.length);
}

function prepareSession(lesson, key = `${state.practiceMode}:${lesson.id}`) {
  let coreSubLessons =
    state.practiceMode === "story"
      ? storySubLessons(lesson)
      : state.practiceMode === "words"
        ? wordPracticeSubLessons(lesson)
        : state.practiceMode === "course"
          ? courseRoundSubLessons(lesson)
          : referenceSubLessons(lesson);
  const currentSkills = new Set(
    coreSubLessons.flatMap((subLesson) => subLesson.exercises.map((exercise) => exercise.skillId ?? exercise.reviewKey).filter(Boolean))
  );
  const reviewExercises = state.practiceMode === "course" ? dueReviewExercises(lesson, currentSkills) : [];
  if (state.practiceMode === "course" && reviewExercises.length) {
    coreSubLessons = trimCourseSubLessons(coreSubLessons, Math.max(4, (lesson.roundQuestionTarget ?? 10) - reviewExercises.length));
  }
  const subLessons = reviewExercises.length
    ? [{ id: `${lesson.id}-review`, title: "Review", kind: "review", exercises: reviewExercises }, ...coreSubLessons]
    : coreSubLessons;
  const totalParts = subLessons.length;
  const selectedVariants = new Map();

  state.sessionExercises = subLessons.flatMap((subLesson, partIndex) => {
    const sourceExercises = subLesson.kind === "conversation" ? [...subLesson.exercises] : shuffleRandom(subLesson.exercises);
    return sourceExercises.map((exercise, exerciseIndex) => {
      const variedExercise = materializeExerciseVariant(exercise, selectedVariants);
      const choices = variedExercise.choices ?? variedExercise.wordBank ?? variedExercise.pairs?.map((pair) => pair.en);
      return {
        ...variedExercise,
        id: variedExercise.id ?? `${lesson.id}-${subLesson.kind}-${exerciseIndex + 1}`,
        reviewKey: variedExercise.reviewKey ?? runtimeReviewKey(variedExercise, lesson.id),
        skillId: variedExercise.skillId ?? variedExercise.reviewKey ?? runtimeReviewKey(variedExercise, lesson.id),
        sessionChoices: choices ? shuffleRandom(choices) : undefined,
        sessionSubLessonTitle: subLesson.title,
        sessionSubLessonKind: subLesson.kind,
        sessionSubLessonIndex: partIndex + 1,
        sessionSubLessonTotal: totalParts
      };
    });
  });
  state.sessionKey = key;
}

function materializeExerciseVariant(exercise, selectedVariants) {
  if (!exercise.variants?.length) return { ...exercise };
  const skillId = exercise.skillId ?? exercise.reviewKey;
  const previousVariantId = state.progress.reviewItems[skillId]?.lastVariantId ?? exercise.excludeVariantId;
  let variantId = selectedVariants.get(skillId);
  if (!variantId) {
    const fresh = exercise.variants.filter((variant) => variant.variantId !== previousVariantId);
    const pool = fresh.length ? fresh : exercise.variants;
    variantId = pool[Math.floor(Math.random() * pool.length)].variantId;
    selectedVariants.set(skillId, variantId);
  }
  const variant = exercise.variants.find((item) => item.variantId === variantId) ?? exercise.variants[0];
  return { ...exercise, ...variant, activeVariantId: variant.variantId };
}

function storySubLessons(lesson) {
  const target = storyRoundQuestionTarget(lesson);
  const coverage = storyPracticeRecord(lesson.id);
  const storyExercises = storyExerciseBank(lesson);
  const pools = [
    { title: "Warm-up", kind: "warmup", types: ["choice", "matching"], count: 3 },
    { title: "Build", kind: "build", types: ["sentence_build"], count: 2 },
    { title: "Understand", kind: "understand", types: ["fill_blank", "structure"], count: 3 },
    { title: "Respond", kind: "conversation", types: ["response"], count: 1 },
    { title: "Speak", kind: "immersion", types: ["speaking", "shadow"], count: 2 }
  ];
  const selected = new Set();
  const selectedKeys = new Set();
  const exerciseKey = (exercise) => exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id);
  const markSelected = (exercise) => {
    selected.add(exercise);
    selectedKeys.add(exerciseKey(exercise));
    return exercise;
  };
  const chooseFromPool = (candidates, count) => {
    const eligible = candidates.filter((exercise) => !selected.has(exercise) && !selectedKeys.has(exerciseKey(exercise)));
    const due = eligible.filter((exercise) => isReviewDue(exercise.skillId ?? exercise.reviewKey));
    const unseen = eligible.filter((exercise) => !coverage.seenReviewKeys.includes(exerciseKey(exercise)));
    const rest = eligible.filter((exercise) => !due.includes(exercise) && !unseen.includes(exercise));
    const ordered = [];
    for (const exercise of [...shuffleRandom(due), ...shuffleRandom(unseen), ...shuffleRandom(rest)]) {
      if (!ordered.includes(exercise)) ordered.push(exercise);
    }
    return ordered.slice(0, count).map(markSelected);
  };
  const subLessons = pools.map((pool) => {
    const candidates = storyExercises.filter((exercise) => pool.types.includes(exercise.type));
    const exercises = chooseFromPool(candidates, pool.count);
    return { id: `${lesson.id}-${pool.kind}`, title: pool.title, kind: pool.kind, exercises };
  });
  let selectedCount = selected.size;
  if (selectedCount < target) {
    const extras = chooseFromPool(storyExercises, target - selectedCount);
    selectedCount += extras.length;
    if (extras.length) subLessons.push({ id: `${lesson.id}-extra`, title: "More practice", kind: "practice", exercises: extras });
  }
  if (!subLessons.some((subLesson) => subLesson.exercises.length)) {
    subLessons.push({ id: `${lesson.id}-practice`, title: "Practice", kind: "practice", exercises: shuffleRandom(storyExercises).slice(0, target) });
  }
  return subLessons.filter((subLesson) => subLesson.exercises.length);
}

function storyExerciseBank(lesson) {
  return lesson.storyExercises?.length ? lesson.storyExercises : lesson.exercises ?? [];
}

function storyRoundQuestionTarget(lesson) {
  if (lesson.level === "advanced") return 12;
  if (["story", "conversation"].includes(lesson.level)) return 11;
  return 10;
}

function storyReviewKeys(lesson) {
  return [
    ...new Set(
      storyExerciseBank(lesson)
        .map((exercise) => exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id))
        .filter(Boolean)
    )
  ];
}

function storyPracticeRecord(lessonId) {
  const record = state.progress.storyPractices[lessonId] ?? {};
  return {
    ...record,
    seenReviewKeys: Array.isArray(record.seenReviewKeys) ? record.seenReviewKeys : [],
    timesPracticed: record.timesPracticed ?? (record.completedAt ? 1 : 0)
  };
}

function storyCoverageLabel(lesson) {
  const total = storyReviewKeys(lesson).length;
  if (!total) return "0 practiced";
  const seen = Math.min(total, storyPracticeRecord(lesson.id).seenReviewKeys?.length ?? 0);
  return `${seen}/${total} story cards seen`;
}

function referenceSubLessons(lesson) {
  const exercises = lesson.reviewExercises?.length ? lesson.reviewExercises : lesson.exercises ?? [];
  const seen = new Set(state.referenceSessionSeenReviewKeys[lesson.id] ?? []);
  const selected = new Set();
  const exerciseKey = (exercise) => exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id);
  const defaultTarget = Math.max(1, lesson.exercises?.length ?? 8);
  const unseenCount = exercises.filter((exercise) => !seen.has(exerciseKey(exercise))).length;
  const target = unseenCount ? Math.min(defaultTarget, unseenCount) : defaultTarget;
  const choose = (predicate, count, allowSeen = false) => {
    const candidates = exercises.filter((exercise) => predicate(exercise) && !selected.has(exerciseKey(exercise)));
    const pool = allowSeen ? candidates : candidates.filter((exercise) => !seen.has(exerciseKey(exercise)));
    return shuffleRandom(pool).slice(0, count).map((exercise) => {
      selected.add(exerciseKey(exercise));
      return exercise;
    });
  };
  const availableSlots = () => Math.max(0, target - selected.size);
  const words = choose((exercise) => ["choice", "matching"].includes(exercise.type), Math.min(3, availableSlots()));
  const enToSiBuilder = choose(
    (exercise) => exercise.type === "sentence_build" && exercise.direction === "en_to_si",
    Math.min(1, availableSlots())
  );
  const siToEnBuilder = choose(
    (exercise) => exercise.type === "sentence_build" && exercise.direction === "si_to_en",
    Math.min(1, availableSlots())
  );
  const pattern = choose(
    (exercise) => ["grammar_choice", "structure", "speaking"].includes(exercise.type),
    Math.min(1, availableSlots())
  );
  const patterns = [...pattern, ...enToSiBuilder, ...siToEnBuilder];
  const conversation = choose(
    (exercise) => exercise.reviewKey?.includes("conversation") || exercise.type === "speaking",
    Math.min(2, availableSlots())
  );
  const selectedCount = words.length + patterns.length + conversation.length;
  const extras = selectedCount < target ? choose(() => true, target - selectedCount) : [];
  const repeated = selected.size < target ? choose(() => true, target - selected.size, true) : [];
  return [
    { id: `${lesson.id}-words`, title: "Words", kind: "warmup", exercises: words },
    { id: `${lesson.id}-patterns`, title: "Patterns", kind: "grammar", exercises: patterns },
    { id: `${lesson.id}-conversation`, title: "Conversation", kind: "conversation", exercises: conversation },
    { id: `${lesson.id}-more`, title: "More practice", kind: "practice", exercises: [...extras, ...repeated] }
  ].filter((subLesson) => subLesson.exercises.length);
}

function recordReferenceSessionSeen(lesson) {
  const seen = new Set(state.referenceSessionSeenReviewKeys[lesson.id] ?? []);
  for (const exercise of state.sessionExercises) {
    seen.add(exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id));
  }
  state.referenceSessionSeenReviewKeys[lesson.id] = [...seen];
}

function isReviewDue(skillId) {
  if (!skillId) return false;
  const item = state.progress.reviewItems[skillId];
  return Boolean(item?.dueAt && new Date(item.dueAt).getTime() <= Date.now());
}

function wordPracticeSubLessons(set) {
  return [
    {
      id: `${set.id}-words`,
      title: "Word drill",
      kind: "warmup",
      exercises: buildWordPracticeExercises(set)
    }
  ];
}

function buildWordPracticeExercises(set) {
  const items = shuffleRandom(set.items).slice(0, Math.min(12, set.items.length));
  return items.map((item, index) => {
    const direction = index % 3 === 0 ? "en_to_si" : "si_to_en";
    const distractors = shuffleRandom(set.items.filter((candidate) => candidate.translationKey !== item.translationKey)).slice(0, 3);
    return {
      id: `${set.id}-word-${index + 1}`,
      type: "word_choice",
      direction,
      prompt: direction === "en_to_si" ? item.en : item.si,
      promptSi: item.si,
      promptEn: item.en,
      promptTransliteration: item.transliteration,
      answer: direction === "en_to_si" ? item.si : item.en,
      choiceItems:
        direction === "en_to_si"
          ? shuffleRandom([item, ...distractors]).map((choice) => ({
              value: choice.si,
              si: choice.si,
              en: choice.en,
              transliteration: choice.transliteration,
              translationKey: choice.translationKey,
              aiMarked: choice.aiMarked
            }))
          : shuffleRandom([item, ...distractors]).map((choice) => ({
              value: choice.en,
              si: choice.si,
              en: choice.en,
              transliteration: choice.transliteration,
              translationKey: choice.translationKey,
              aiMarked: choice.aiMarked
            })),
      translationKey: item.translationKey,
      translationStatus: item.translationStatus,
      translationOrigin: item.translationOrigin,
      aiMarked: item.aiMarked,
      reviewKey: `word-drill:${set.id}:${item.translationKey}:${direction}`,
      skillId: `word-drill:${item.translationKey}`,
      sourceLevel: set.level
    };
  });
}

function dueReviewExercises(lesson, currentSkills) {
  const rank = levelRank(lesson.level);
  const seenSkills = new Set();
  const due = Object.entries(state.progress.reviewItems)
    .filter(([, item]) => item.dueAt && new Date(item.dueAt).getTime() <= Date.now())
    .sort(([, a], [, b]) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .map(([storedKey, item]) => {
      const skillId = item.skillId ?? storedKey;
      if (seenSkills.has(skillId) || currentSkills.has(skillId)) return null;
      seenSkills.add(skillId);
      const candidates = reviewExerciseBank().get(skillId) ?? [];
      const atLevel = candidates.filter((exercise) => levelRank(exercise.reviewLevel) <= rank);
      if (!atLevel.length) return null;
      const fresh = atLevel.filter((exercise) => exercise.reviewKey !== item.lastExerciseKey);
      const pool = fresh.length ? fresh : atLevel;
      return { ...pool[Math.floor(Math.random() * pool.length)], excludeVariantId: item.lastVariantId };
    })
    .filter(Boolean);
  const limit = lesson.level === "basic" ? 1 : 2;
  return shuffleRandom(due.slice(0, 8)).slice(0, limit);
}

function reviewExerciseBank() {
  if (state.reviewBank) return state.reviewBank;
  state.reviewBank = new Map();
  for (const lesson of state.data.courseLessons) {
    for (const exercise of [...lesson.exercises, ...(lesson.variationPool ?? [])]) {
      const skillId = exercise.skillId ?? exercise.reviewKey;
      if (!skillId) continue;
      const candidates = state.reviewBank.get(skillId) ?? [];
      if (!candidates.some((candidate) => candidate.reviewKey === exercise.reviewKey && candidate.type === exercise.type)) {
        candidates.push({ ...exercise, reviewLevel: lesson.level });
      }
      state.reviewBank.set(skillId, candidates);
    }
  }
  for (const exercise of state.data.course.reviewExercises ?? []) {
    const skillId = exercise.skillId ?? exercise.reviewKey;
    if (!skillId) continue;
    const candidates = state.reviewBank.get(skillId) ?? [];
    if (!candidates.some((candidate) => candidate.reviewKey === exercise.reviewKey && candidate.type === exercise.type)) {
      candidates.push({ ...exercise, reviewLevel: exercise.sourceLevel });
    }
    state.reviewBank.set(skillId, candidates);
  }
  return state.reviewBank;
}

function runtimeReviewKey(exercise, lessonId) {
  if (exercise.type === "choice") return `vocab:${cleanToken(exercise.prompt)}`;
  if (exercise.translationKey) return `passage:${exercise.translationKey}:${exercise.type}`;
  return `${exercise.type}:${lessonId}:${cleanToken(exercise.prompt ?? exercise.title ?? "practice")}`;
}

function levelRank(level) {
  return ["basic", "foundation", "story", "conversation", "advanced"].indexOf(level);
}

function shuffleRandom(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function startLesson(id) {
  state.practiceMode = "course";
  state.currentLessonId = id;
  state.answer = null;
  state.revealedTranslations = {};
  state.completionNotice = "";
  state.completionPrompt = null;
  restoreCourseCheckpoint(id);
  setView("practice");
  renderPractice();
}

function startWordPractice(id) {
  const set = wordPracticeSetById(id);
  if (!set) return;
  state.practiceMode = "words";
  state.currentWordPracticeSetId = id;
  state.exerciseIndex = 0;
  state.answer = null;
  state.lessonPass = 1;
  state.revealedTranslations = {};
  state.sessionKey = "";
  state.sessionExercises = [];
  state.completionNotice = "";
  state.completionPrompt = null;
  setView("practice");
  renderPractice();
}

function startStoryLesson(id) {
  const lesson = sourceLessonById(id);
  if (!lesson || !storyExerciseBank(lesson).length) return;
  state.practiceMode = "story";
  state.currentSourceLessonId = id;
  state.exerciseIndex = 0;
  state.answer = null;
  state.lessonPass = 1;
  state.revealedTranslations = {};
  state.sessionKey = "";
  state.sessionExercises = [];
  state.completionNotice = "";
  state.completionPrompt = null;
  setView("practice");
  renderPractice();
}

function startReferenceLesson(id) {
  const lesson = referenceLessonById(id);
  if (!lesson?.exercises.length) return;
  state.practiceMode = "reference";
  state.currentReferenceLessonId = id;
  state.exerciseIndex = 0;
  state.answer = null;
  state.lessonPass = 1;
  state.revealedTranslations = {};
  state.sessionKey = "";
  state.sessionExercises = [];
  state.completionNotice = "";
  state.completionPrompt = null;
  setView("practice");
  renderPractice();
}

function currentLesson() {
  if (state.practiceMode === "words") return wordPracticeSetById(state.currentWordPracticeSetId);
  if (state.practiceMode === "story") return sourceLessonById(state.currentSourceLessonId);
  if (state.practiceMode === "reference") return referenceLessonById(state.currentReferenceLessonId);
  return courseLessonById(state.currentLessonId);
}

function renderSidePracticeCompletion(lesson) {
  const modeLabel =
    state.practiceMode === "story" ? "Story practice" : state.practiceMode === "reference" ? "Topic review" : "Word drill";
  els.practiceMeta.textContent = `${modeLabel} · Complete`;
  els.practiceProgress.style.width = "100%";
  els.completionNotice.hidden = !state.completionNotice;
  els.completionNotice.textContent = state.completionNotice;
  els.practiceCard.innerHTML = `
    <div class="card-stage completion-stage">
      <div class="prompt">
        <span class="prompt-label">Choose your next step</span>
        <h3>Keep practicing ${escapeHtml(lesson.title)}?</h3>
        <p>Continue starts a fresh practice session for this same selection. Exit returns to its study tab.</p>
      </div>
      <div class="completion-actions">
        <button class="primary-action" type="button" id="continueSidePractice">Continue</button>
        <button class="secondary-action" type="button" id="exitSidePractice">Exit</button>
      </div>
    </div>`;
  els.practiceCard.querySelector("#continueSidePractice").addEventListener("click", continueSidePractice);
  els.practiceCard.querySelector("#exitSidePractice").addEventListener("click", exitSidePractice);
}

function finishSidePractice(lesson, notice) {
  if (state.practiceMode === "reference") recordReferenceSessionSeen(lesson);
  state.exerciseIndex = 0;
  state.answer = null;
  state.lessonPass = 1;
  state.sessionKey = "";
  state.sessionExercises = [];
  state.revealedTranslations = {};
  state.completionNotice = `${notice} Continue to practice this selection again, or Exit.`;
  state.completionPrompt = { mode: state.practiceMode, lessonId: lesson.id };
  renderHeader();
  renderPractice();
  setView("practice");
}

function continueSidePractice() {
  const prompt = state.completionPrompt;
  if (!prompt) return;
  if (prompt.mode === "words") startWordPractice(prompt.lessonId);
  else if (prompt.mode === "story") startStoryLesson(prompt.lessonId);
  else if (prompt.mode === "reference") startReferenceLesson(prompt.lessonId);
}

function exitSidePractice() {
  const prompt = state.completionPrompt;
  state.completionPrompt = null;
  state.completionNotice = "";
  state.answer = null;
  state.sessionKey = "";
  state.sessionExercises = [];
  state.practiceMode = "course";
  restoreCourseCheckpoint(state.currentLessonId);
  if (prompt?.mode === "words") {
    renderWords();
    setView("words");
  } else if (prompt?.mode === "story") {
    renderScripts();
    setView("scripts");
  } else if (prompt?.mode === "reference") {
    renderGrammar();
    setView("grammar");
  }
}

function renderPracticeLessonSelect() {
  const specialOption =
    state.practiceMode === "story"
      ? `<option value="story:${escapeHtml(state.currentSourceLessonId)}">Story · ${escapeHtml(sourceLessonById(state.currentSourceLessonId)?.title ?? "Practice")}</option>`
      : state.practiceMode === "reference"
        ? `<option value="reference:${escapeHtml(state.currentReferenceLessonId)}">Topic · ${escapeHtml(referenceLessonById(state.currentReferenceLessonId)?.title ?? "Review")}</option>`
        : state.practiceMode === "words"
          ? `<option value="words:${escapeHtml(state.currentWordPracticeSetId)}">Words · ${escapeHtml(wordPracticeSetById(state.currentWordPracticeSetId)?.title ?? "Drill")}</option>`
        : "";
  const courseOptions = state.data.courseLessons
    .map((lesson) => `<option value="${lesson.id}">${escapeHtml(lesson.title)} · ${escapeHtml(levelById(lesson.level).title)}</option>`)
    .join("");
  els.lessonSelect.innerHTML = specialOption + courseOptions;
  els.lessonSelect.value =
    state.practiceMode === "story"
      ? `story:${state.currentSourceLessonId}`
      : state.practiceMode === "reference"
        ? `reference:${state.currentReferenceLessonId}`
        : state.practiceMode === "words"
          ? `words:${state.currentWordPracticeSetId}`
        : state.currentLessonId;
}

function courseLessonById(id) {
  return state.data.courseLessons.find((lesson) => lesson.id === id);
}

function sourceLessonById(id) {
  return state.data.lessons.find((lesson) => lesson.id === id);
}

function referenceLessonById(id) {
  return state.data.course.referenceLessons?.find((lesson) => lesson.id === id);
}

function wordPracticeSetById(id) {
  return state.data.course.wordPracticeSets?.find((set) => set.id === id);
}

function nextLesson() {
  return state.data?.courseLessons.find((lesson) => !state.progress.lessons[lesson.id]);
}

function nextRecommendedLesson() {
  const checkpoint = currentCourseCheckpoint();
  if (checkpoint) return courseLessonById(checkpoint.lessonId) ?? nextLesson();
  return nextLesson();
}

function requiredPassesForLesson() {
  return ["course", "story"].includes(state.practiceMode) ? 3 : 1;
}

function requiredPassesForMode(mode) {
  return ["course", "story"].includes(mode) ? 3 : 1;
}

function nextCourseLessonAfter(id) {
  const index = state.data.courseLessons.findIndex((lesson) => lesson.id === id);
  return index >= 0 ? state.data.courseLessons[index + 1] ?? null : nextLesson();
}

function currentRecommendedLevel() {
  const lesson = nextRecommendedLesson() ?? state.data?.courseLessons.at(-1);
  return levelById(lesson?.level);
}

function levelById(id) {
  return state.data?.course.levels?.find((level) => level.id === id) ?? { id, title: id ?? "Level", description: "", readiness: "" };
}

function partLabel(name) {
  return {
    connector: "Connector",
    subject: "Subject",
    recipient: "To/for",
    possessive: "Possessive",
    timePlace: "Time/place",
    object: "Object",
    verb: "Verb",
    negation: "Negation"
  }[name] ?? name;
}

function completeLesson(lesson) {
  if (!state.progress.lessons[lesson.id]) state.progress.totalXp += lesson.xp;
  state.progress.lessons[lesson.id] = {
    completedAt: new Date().toISOString(),
    xp: lesson.xp
  };
  updateStudyStreak();
  saveProgress();
}

function completeStoryPractice(lesson) {
  const previous = storyPracticeRecord(lesson.id);
  if (!previous.completedAt) state.progress.totalXp += lesson.xp;
  state.progress.storyPractices[lesson.id] = {
    ...previous,
    completedAt: new Date().toISOString(),
    xp: lesson.xp,
    timesPracticed: (previous.timesPracticed ?? 0) + 1,
    totalReviewKeys: storyReviewKeys(lesson).length
  };
  updateStudyStreak();
  saveProgress();
}

function completeReferencePractice(lesson) {
  if (!state.progress.referencePractices[lesson.id]) state.progress.totalXp += lesson.xp;
  state.progress.referencePractices[lesson.id] = {
    completedAt: new Date().toISOString(),
    xp: lesson.xp
  };
  updateStudyStreak();
  saveProgress();
}

function completeWordPractice(lesson) {
  if (!state.progress.wordPractices[lesson.id]) state.progress.totalXp += lesson.xp;
  state.progress.wordPractices[lesson.id] = {
    completedAt: new Date().toISOString(),
    xp: lesson.xp
  };
  updateStudyStreak();
  saveProgress();
}

function updateStudyStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.progress.lastStudyDate !== today) {
    state.progress.streakDays += 1;
    state.progress.lastStudyDate = today;
  }
}

function recordAttempt(exercise, correct) {
  state.progress.attempts += 1;
  if (correct) state.progress.correct += 1;
  state.progress.exerciseStats[exercise.type] = (state.progress.exerciseStats[exercise.type] ?? 0) + 1;
  recordStoryExerciseSeen(exercise);
  updateSpacedRepetition(exercise, correct);
  saveProgress();
}

function recordStoryExerciseSeen(exercise) {
  if (state.practiceMode !== "story") return;
  const lesson = sourceLessonById(state.currentSourceLessonId);
  if (!lesson) return;
  const key = exercise.reviewKey ?? runtimeReviewKey(exercise, lesson.id);
  if (!key) return;
  const previous = storyPracticeRecord(lesson.id);
  const seen = new Set(previous.seenReviewKeys ?? []);
  seen.add(key);
  state.progress.storyPractices[lesson.id] = {
    ...previous,
    seenReviewKeys: [...seen],
    totalReviewKeys: storyReviewKeys(lesson).length,
    lastPracticedAt: new Date().toISOString()
  };
}

function checkpointForLesson(lessonId) {
  const checkpoint = state.progress.courseCheckpoint;
  if (!checkpoint || checkpoint.lessonId !== lessonId) return null;
  if (state.progress.lessons[lessonId]) return null;
  return checkpoint;
}

function currentCourseCheckpoint() {
  return checkpointForLesson(state.progress.courseCheckpoint?.lessonId);
}

function lessonRoundProgress(lesson) {
  if (state.progress.lessons[lesson.id]) return 1;
  const checkpoint = checkpointForLesson(lesson.id);
  if (!checkpoint) return 0;
  const total = Math.max(1, checkpoint.totalExercises ?? lesson.exercises.length ?? 1);
  const rounds = requiredPassesForMode("course");
  const completedRounds = Math.max(0, (checkpoint.lessonPass ?? 1) - 1);
  const currentRoundFraction = Math.max(0, Math.min(1, (checkpoint.exerciseIndex ?? 0) / total));
  return Math.max(0, Math.min(1, (completedRounds + currentRoundFraction) / rounds));
}

function restoreCourseCheckpoint(lessonId) {
  const checkpoint = checkpointForLesson(lessonId);
  if (checkpoint) {
    state.exerciseIndex = Math.max(0, checkpoint.exerciseIndex ?? 0);
    state.lessonPass = Math.max(1, checkpoint.lessonPass ?? 1);
    state.sessionKey = checkpoint.sessionKey ?? "";
    state.sessionExercises = checkpoint.sessionExercises ?? [];
    state.revealedTranslations = checkpoint.revealedTranslations ?? {};
    return;
  }
  state.exerciseIndex = 0;
  state.lessonPass = 1;
  state.sessionKey = "";
  state.sessionExercises = [];
}

function saveCourseCheckpoint() {
  if (state.practiceMode !== "course") return;
  const lesson = courseLessonById(state.currentLessonId);
  if (!lesson || state.progress.lessons[lesson.id]) return;
  state.progress.courseCheckpoint = {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonPass: state.lessonPass,
    exerciseIndex: state.exerciseIndex,
    totalExercises: state.sessionExercises.length || lesson.exercises.length,
    sessionKey: state.sessionKey,
    sessionExercises: state.sessionExercises,
    revealedTranslations: state.revealedTranslations,
    updatedAt: new Date().toISOString()
  };
  saveProgress();
}

function clearCourseCheckpoint(lessonId = null) {
  const checkpoint = state.progress.courseCheckpoint;
  if (!checkpoint) return;
  if (lessonId && checkpoint.lessonId !== lessonId) return;
  state.progress.courseCheckpoint = null;
  saveProgress();
}

function updateSpacedRepetition(exercise, correct) {
  const skillId = exercise.skillId ?? exercise.reviewKey;
  if (!skillId) return;
  const previous = state.progress.reviewItems[skillId] ?? {
    ease: 2.3,
    intervalDays: 0,
    streak: 0,
    lapses: 0,
    attempts: 0,
    correct: 0
  };
  const streak = correct ? previous.streak + 1 : 0;
  const ease = Math.max(1.3, Math.min(2.8, previous.ease + (correct ? 0.05 : -0.2)));
  const intervalDays = correct
    ? streak === 1
      ? 1
      : streak === 2
        ? 3
        : Math.min(90, Math.max(4, Math.round(previous.intervalDays * ease)))
    : 10 / (24 * 60);
  state.progress.reviewItems[skillId] = {
    reviewKey: skillId,
    skillId,
    type: exercise.type,
    prompt: String(exercise.prompt ?? exercise.title ?? "Review").slice(0, 120),
    ease,
    intervalDays,
    streak,
    lapses: previous.lapses + (correct ? 0 : 1),
    attempts: previous.attempts + 1,
    correct: previous.correct + (correct ? 1 : 0),
    lastExerciseKey: exercise.reviewKey,
    lastVariantId: exercise.activeVariantId ?? null,
    lastSeenAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
  };
}

function setView(view) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.toggle("active", panel.id === `${view}View`));
  if (view === "words") renderWords();
  if (view === "reader") renderReader();
  if (view === "grammar") renderGrammar();
  if (view === "translations") renderTranslationEditor();
  if (view === "progress") renderStats();
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem("sinhala-settings")));
  } catch {
    return defaultSettings();
  }
}

function normalizeSettings(settings) {
  const rate = Number(settings?.transliterationRate);
  return {
    ...defaultSettings(),
    ...(settings ?? {}),
    transliterationRate: Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : defaultSettings().transliterationRate
  };
}

function defaultSettings() {
  return {
    transliterationRate: 0.2
  };
}

function saveSettings() {
  localStorage.setItem("sinhala-settings", JSON.stringify(state.settings));
}

function loadProgress() {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem("sinhala-progress")));
  } catch {
    return defaultProgress();
  }
}

function normalizeProgress(progress) {
  return {
    ...defaultProgress(),
    ...(progress ?? {}),
    lessons: progress?.lessons ?? {},
    courseCheckpoint: progress?.courseCheckpoint ?? null,
    wordPractices: progress?.wordPractices ?? {},
    storyPractices: progress?.storyPractices ?? {},
    referencePractices: progress?.referencePractices ?? {},
    reviewItems: normalizeReviewItems(progress?.reviewItems),
    exerciseStats: progress?.exerciseStats ?? {}
  };
}

function normalizeReviewItems(items = {}) {
  const concepts = {};
  for (const [storedKey, item] of Object.entries(items)) {
    const skillId = item.skillId ?? storedKey;
    const existing = concepts[skillId];
    const itemSeen = new Date(item.lastSeenAt ?? 0).getTime();
    const existingSeen = new Date(existing?.lastSeenAt ?? 0).getTime();
    if (!existing || itemSeen >= existingSeen) concepts[skillId] = { ...item, reviewKey: skillId, skillId };
  }
  return concepts;
}

function defaultProgress() {
  return {
    streakDays: 0,
    lastStudyDate: "",
    totalXp: 0,
    attempts: 0,
    correct: 0,
    vocabClicks: 0,
    copiedLines: 0,
    readerOpens: 0,
    lessons: {},
    courseCheckpoint: null,
    wordPractices: {},
    storyPractices: {},
    referencePractices: {},
    reviewItems: {},
    exerciseStats: {}
  };
}

function saveProgress() {
  localStorage.setItem("sinhala-progress", JSON.stringify(state.progress));
}

function loadTranslationOverrides() {
  try {
    return JSON.parse(localStorage.getItem("sinhala-translation-overrides")) ?? {};
  } catch {
    return {};
  }
}

function saveTranslationOverrides() {
  localStorage.setItem("sinhala-translation-overrides", JSON.stringify(state.translationOverrides));
}

function stableShuffle(items, seedText) {
  const seed = [...seedText].reduce((total, char) => total + char.codePointAt(0), 0);
  return [...items].sort((a, b) => {
    const av = [...a].reduce((total, char) => total + char.codePointAt(0), seed);
    const bv = [...b].reduce((total, char) => total + char.codePointAt(0), seed);
    return (av % 89) - (bv % 89);
  });
}

function cleanToken(value) {
  return String(value).replace(/[.,!?;:()[\]'"“”‘’]/g, "").trim();
}

function hasSinhalaText(value) {
  return /[\u0D80-\u0DFF]/.test(String(value ?? ""));
}

function transliterationSeed(value) {
  return [...String(value ?? "")].reduce((total, char, index) => {
    return (total + ((char.codePointAt(0) ?? 0) * (index + 1))) % 2147483647;
  }, 0);
}

function shouldUseTransliteration(exercise, text, transliterationOverride = "") {
  if (!hasSinhalaText(text)) return false;
  const rate = Number(state.settings.transliterationRate ?? 0);
  if (rate <= 0) return false;
  if (!transliterationOverride && !text) return false;
  const key = `${exercise?.reviewKey ?? exercise?.id ?? exercise?.translationKey ?? "practice"}`;
  return (transliterationSeed(key) % 1000) / 1000 < rate;
}

function visibleSinhalaText(text, exercise, transliterationOverride = "") {
  if (!hasSinhalaText(text)) return String(text ?? "");
  if (!shouldUseTransliteration(exercise, text, transliterationOverride)) return String(text ?? "");
  return transliterationOverride || transliterateSinhala(String(text ?? ""));
}

function practiceSinhalaHtml(text, contextTranslation = "", exercise, options = {}) {
  const raw = String(text ?? "");
  if (!raw) return "";
  const visible = visibleSinhalaText(raw, exercise, options.transliteration);
  const classNames = [
    hasSinhalaText(raw) ? "sinhala-choice" : "",
    visible !== raw ? "translit-text" : "",
    options.compact ? "compact" : ""
  ]
    .filter(Boolean)
    .join(" ");
  if (visible !== raw || options.tokens === false) return `<span class="${classNames}">${escapeHtml(visible)}</span>`;
  return `<span class="${classNames}">${renderTokens(raw, contextTranslation)}</span>`;
}

function transliterateSinhala(text) {
  const independentVowels = {
    "අ": "a",
    "ආ": "aa",
    "ඇ": "ae",
    "ඈ": "aae",
    "ඉ": "i",
    "ඊ": "ii",
    "උ": "u",
    "ඌ": "uu",
    "ඍ": "ri",
    "එ": "e",
    "ඒ": "ee",
    "ඓ": "ai",
    "ඔ": "o",
    "ඕ": "oo",
    "ඖ": "au"
  };
  const consonants = {
    "ක": "k",
    "ඛ": "kh",
    "ග": "g",
    "ඝ": "gh",
    "ඞ": "ng",
    "ඟ": "ng",
    "ච": "ch",
    "ඡ": "chh",
    "ජ": "j",
    "ඣ": "jh",
    "ඤ": "ny",
    "ට": "t",
    "ඨ": "th",
    "ඩ": "d",
    "ඪ": "dh",
    "ණ": "n",
    "ත": "th",
    "ථ": "thh",
    "ද": "d",
    "ධ": "dh",
    "න": "n",
    "ප": "p",
    "ඵ": "ph",
    "බ": "b",
    "භ": "bh",
    "ම": "m",
    "ය": "y",
    "ර": "r",
    "ල": "l",
    "ව": "w",
    "ශ": "sh",
    "ෂ": "sh",
    "ස": "s",
    "හ": "h",
    "ළ": "l",
    "ෆ": "f",
    "ඥ": "gn",
    "ඦ": "j"
  };
  const vowelSigns = {
    "ා": "aa",
    "ැ": "ae",
    "ෑ": "aae",
    "ි": "i",
    "ී": "ii",
    "ු": "u",
    "ූ": "uu",
    "ෘ": "ru",
    "ෙ": "e",
    "ේ": "ee",
    "ෛ": "ai",
    "ො": "o",
    "ෝ": "oo",
    "ෞ": "au"
  };
  const modifiers = {
    "ං": "n",
    "ඃ": "h"
  };
  const virama = "්";
  const chars = [...String(text ?? "")];
  let result = "";

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (independentVowels[char]) {
      result += independentVowels[char];
      continue;
    }
    if (consonants[char]) {
      const next = chars[index + 1];
      if (vowelSigns[next]) {
        result += consonants[char] + vowelSigns[next];
        index += 1;
        continue;
      }
      if (next === virama) {
        result += consonants[char];
        index += 1;
        continue;
      }
      result += `${consonants[char]}a`;
      continue;
    }
    if (modifiers[char]) {
      result += modifiers[char];
      continue;
    }
    if (vowelSigns[char]) {
      result += vowelSigns[char];
      continue;
    }
    result += char;
  }

  return result.replace(/\s+/g, " ").trim();
}

function normalizeBuiltSentence(value) {
  return String(value ?? "")
    .replace(/[.,!?;:()[\]{}"“”‘’]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setOfflineStatus(message, status) {
  if (!els.offlineStatus) return;
  els.offlineStatus.textContent = message;
  els.offlineStatus.className = `offline-status is-${status}`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setOfflineStatus("Offline installation is not supported in this browser.", "error");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    await waitForServiceWorkerActivation(registration);
    setOfflineStatus("Offline ready", "ready");
  } catch (error) {
    setOfflineStatus("Offline setup failed. Stay online and reload to try again.", "error");
    console.error("Service worker registration failed", error);
  }
}

function waitForServiceWorkerActivation(registration) {
  if (registration.active?.state === "activated") return Promise.resolve();

  const worker = registration.installing ?? registration.waiting;
  if (!worker) return navigator.serviceWorker.ready.then(() => undefined);

  return new Promise((resolve, reject) => {
    const handleStateChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", handleStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", handleStateChange);
        reject(new Error("The complete offline cache could not be installed"));
      }
    };

    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  });
}
