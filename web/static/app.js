const sampleQuestions = [
  {
    prompt: "Which keyword defines a function in Python?",
    options: ["func", "def", "function", "make"],
    answer: 1,
  },
  {
    prompt: "What is the result of 3 * 4?",
    options: ["7", "12", "34", "1"],
    answer: 1,
  },
  {
    prompt: "Which type stores an ordered, changeable collection?",
    options: ["tuple", "set", "list", "bool"],
    answer: 2,
  },
];

function getTopicLabel(topicValue) {
  const match = topicButtons.find((topic) => topic.value === topicValue);
  return match ? match.label : "Any topic";
}

const topicButtons = [
  { value: "", label: "Any topic" },
  { value: "9", label: "General knowledge" },
  { value: "10", label: "Books" },
  { value: "11", label: "Film" },
  { value: "12", label: "Music" },
  { value: "14", label: "Television" },
  { value: "15", label: "Video games" },
  { value: "17", label: "Science & nature" },
  { value: "18", label: "Computers" },
  { value: "19", label: "Mathematics" },
  { value: "20", label: "Mythology" },
  { value: "21", label: "Sports" },
  { value: "22", label: "Geography" },
  { value: "23", label: "History" },
  { value: "24", label: "Politics" },
  { value: "25", label: "Art" },
  { value: "26", label: "Celebrities" },
  { value: "27", label: "Animals" },
  { value: "28", label: "Vehicles" },
  { value: "29", label: "Comics" },
  { value: "30", label: "Gadgets" },
  { value: "31", label: "Anime & manga" },
  { value: "32", label: "Cartoons & animation" },
];

const views = [...document.querySelectorAll(".view")];
const draftQuestions = [];
const historyKey = "quickQuiz.history.v1";
const historyLimit = 50;
const themeKey = "quickQuiz.theme.v1";
const timerKey = "quickQuiz.timeLimit.v1";
const topicKey = "quickQuiz.topic.v1";
const topicSelect = document.querySelector("#topic-select");
const topicPicker = document.querySelector("#topic-picker");

function loadSelectedTopics() {
  const raw = localStorage.getItem(topicKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => String(value).trim())
        .filter((value) => value !== "");
    }
  } catch {
    // Fall through to legacy single-topic storage.
  }

  const legacyTopics = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return legacyTopics;
}

function saveSelectedTopics(selectedTopics) {
  localStorage.setItem(topicKey, JSON.stringify(selectedTopics));
  const singleValue = selectedTopics.length === 1 ? selectedTopics[0] : "";
  topicSelect.value = [...topicSelect.options].some(
    (option) => option.value === singleValue,
  )
    ? singleValue
    : "";
}

function renderTopicPicker() {
  const selectedTopics = loadSelectedTopics();
  topicPicker.replaceChildren();

  topicButtons.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-option";
    button.setAttribute(
      "aria-pressed",
      String(topic.value === "" ? selectedTopics.length === 0 : selectedTopics.includes(topic.value)),
    );

    if (topic.value === "") {
      if (selectedTopics.length === 0) {
        button.classList.add("selected");
      }
    } else if (selectedTopics.includes(topic.value)) {
      button.classList.add("selected");
    }

    button.textContent = topic.label;
    button.addEventListener("click", () => {
      const nextSelected = [...loadSelectedTopics()];
      if (topic.value === "") {
        saveSelectedTopics([]);
      } else {
        const existingIndex = nextSelected.indexOf(topic.value);
        if (existingIndex >= 0) {
          nextSelected.splice(existingIndex, 1);
        } else {
          nextSelected.push(topic.value);
        }
        saveSelectedTopics(nextSelected);
      }
      renderTopicPicker();
    });
    topicPicker.append(button);
  });
}

saveSelectedTopics(loadSelectedTopics());
renderTopicPicker();

let questionTimeLimit = Number(localStorage.getItem(timerKey)) || 30;
let timerInterval = null;
let timeoutAdvance = null;
let timerSeconds = questionTimeLimit;
let activeQuestions = [];
let selectedAnswers = [];
let currentIndex = 0;
let score = 0;
let answered = false;
let attemptSaved = false;

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

let quizHistory = loadHistory();

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  const button = document.querySelector("#theme-toggle");
  button.textContent = dark ? "Light mode" : "Dark mode";
  button.setAttribute(
    "aria-label",
    `Switch to ${dark ? "light" : "dark"} mode`,
  );
  document.querySelector('meta[name="theme-color"]').content = dark
    ? "#172321"
    : "#edf2ee";
}

function clearQuestionTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const chip = document.querySelector("#timer-chip");
  document.querySelector("#timer-value").textContent = timerSeconds;
  document.querySelector("#timer-unit").hidden = false;
  chip.classList.toggle("urgent", timerSeconds <= 5);
  chip.setAttribute("aria-label", `${timerSeconds} seconds remaining`);
}

function startQuestionTimer() {
  clearQuestionTimer();
  if (timeoutAdvance !== null) clearTimeout(timeoutAdvance);
  timeoutAdvance = null;
  timerSeconds = questionTimeLimit;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearQuestionTimer();
      document.querySelector("#feedback").textContent =
        "Time is up. Skipping this question.";
      document.querySelectorAll(".answer").forEach((button) => {
        button.disabled = true;
      });
      document.querySelector("#skip-button").disabled = true;
      timeoutAdvance = setTimeout(advanceQuestion, 750);
    }
  }, 1000);
}

function showAnswerReaction(correct) {
  const quizView = document.querySelector("#quiz-view");
  quizView.classList.remove("reaction-correct", "reaction-wrong");
  const reactionDelay = correct ? 1100 : 1350;
  requestAnimationFrame(() => {
    quizView.classList.add(correct ? "reaction-correct" : "reaction-wrong");
  });
  return reactionDelay;
}

function syncQuestionReactionState() {
  const quizView = document.querySelector("#quiz-view");
  const question = activeQuestions[currentIndex];
  const selectedIndex = selectedAnswers[currentIndex];

  quizView.classList.remove("reaction-correct", "reaction-wrong");

  if (selectedIndex === null || !question) return;

  const correct = selectedIndex === question.answer;
  if (correct) {
    quizView.classList.add("reaction-correct");
    return;
  }

  quizView.classList.add("reaction-wrong");
}

function advanceQuestion() {
  if (timeoutAdvance !== null) clearTimeout(timeoutAdvance);
  timeoutAdvance = null;
  clearQuestionTimer();
  if (currentIndex === activeQuestions.length - 1) {
    finishQuiz();
    return;
  }
  currentIndex += 1;
  renderQuestion();
}

function showView(name) {
  for (const view of views) {
    view.classList.toggle("active", view.id === `${name}-view`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function beginQuiz(questions, source) {
  clearQuestionTimer();
  activeQuestions = questions.map((question) => ({
    ...question,
    options: [...question.options],
  }));
  selectedAnswers = new Array(activeQuestions.length).fill(null);
  currentIndex = 0;
  score = 0;
  attemptSaved = false;
  document.querySelector("#quiz-source").textContent = source;
  showView("quiz");
  renderQuestion();
}

function renderQuestion() {
  clearQuestionTimer();
  if (timeoutAdvance !== null) clearTimeout(timeoutAdvance);
  timeoutAdvance = null;

  const question = activeQuestions[currentIndex];
  const selectedIndex = selectedAnswers[currentIndex];
  syncQuestionReactionState();
  answered = selectedIndex !== null;
  score = selectedAnswers.reduce(
    (total, answer, index) =>
      total + Number(answer === activeQuestions[index].answer),
    0,
  );
  document.querySelector("#progress-label").textContent =
    `Question ${currentIndex + 1} of ${activeQuestions.length}`;
  document.querySelector("#score-label").textContent = score;
  document.querySelector("#question-text").textContent = question.prompt;
  document.querySelector("#feedback").textContent = "";

  const progress = Math.round((currentIndex / activeQuestions.length) * 100);
  document.querySelector("#progress-fill").style.width = `${progress}%`;
  document
    .querySelector(".progress-track")
    .setAttribute("aria-valuenow", progress);

  const answers = document.querySelector("#answer-list");
  answers.replaceChildren();
  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.textContent = option;
    button.dataset.index = index;
    button.disabled = selectedIndex !== null;
    if (selectedIndex !== null && index === question.answer) {
      button.classList.add("correct");
    }
    if (
      selectedIndex !== null &&
      index === selectedIndex &&
      selectedIndex !== question.answer
    ) {
      button.classList.add("incorrect");
    }
    answers.append(button);
  });

  document.querySelector("#feedback").textContent =
    selectedIndex === null
      ? ""
      : selectedIndex === question.answer
        ? "Correct. Nice one."
        : `Not quite. The answer is ${question.options[question.answer]}.`;
  document.querySelector("#previous-button").disabled = currentIndex === 0;
  const skipButton = document.querySelector("#skip-button");
  skipButton.hidden = answered;
  skipButton.disabled = answered;

  const nextButton = document.querySelector("#next-button");
  nextButton.disabled = !answered;
  nextButton.textContent = !answered
    ? "Choose an answer"
    : currentIndex === activeQuestions.length - 1
      ? "See results"
      : "Next question";

  if (answered) {
    document.querySelector("#timer-chip").classList.remove("urgent");
    document.querySelector("#timer-value").textContent = "Done";
    document.querySelector("#timer-unit").hidden = true;
    document
      .querySelector("#timer-chip")
      .setAttribute("aria-label", "Question answered");
  } else {
    startQuestionTimer();
  }
}

function updateStatChart() {
  const totalQuestions = activeQuestions.length || 1;
  const skippedCount = selectedAnswers.filter((answer) => answer === null).length;
  const incorrectCount = Math.max(
    activeQuestions.length - score - skippedCount,
    0,
  );
  const answeredCount = activeQuestions.length - skippedCount;

  const chartEntries = [
    { id: "chart-correct", value: score, label: "chart-correct-value", color: "correct" },
    { id: "chart-incorrect", value: incorrectCount, label: "chart-incorrect-value", color: "incorrect" },
    { id: "chart-skipped", value: skippedCount, label: "chart-skipped-value", color: "skipped" },
    { id: "chart-answered", value: answeredCount, label: "chart-answered-value", color: "answered" },
  ];

  for (const entry of chartEntries) {
    const element = document.getElementById(entry.id);
    const label = document.getElementById(entry.label);
    const percent = Math.round((entry.value / totalQuestions) * 100);
    element.style.width = `${percent}%`;
    label.textContent = `${percent}%`;
  }
}

function finishQuiz() {
  if (!attemptSaved) {
    const attempt = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      completedAt: new Date().toISOString(),
      source: document.querySelector("#quiz-source").textContent,
      score,
      questions: activeQuestions.map((question) => ({
        ...question,
        options: [...question.options],
      })),
      answers: [...selectedAnswers],
    };
    quizHistory.unshift(attempt);
    quizHistory = quizHistory.slice(0, historyLimit);
    attemptSaved = true;
    try {
      localStorage.setItem(historyKey, JSON.stringify(quizHistory));
    } catch {
      document.querySelector("#home-status").textContent =
        "This browser could not save quiz history.";
    }
    renderHistory();
  }

  document.querySelector("#final-score").textContent =
    `${score}/${activeQuestions.length}`;
  const skippedCount = selectedAnswers.filter((answer) => answer === null).length;
  const incorrectCount = activeQuestions.length - score - skippedCount;
  const answeredCount = activeQuestions.length - skippedCount;
  const accuracy =
    answeredCount === 0 ? 0 : Math.round((score / answeredCount) * 100);
  document.querySelector("#stat-answered").textContent = answeredCount;
  document.querySelector("#stat-correct").textContent = score;
  document.querySelector("#stat-incorrect").textContent = incorrectCount;
  document.querySelector("#stat-skipped").textContent = skippedCount;
  document.querySelector("#stat-accuracy").textContent = `${accuracy}%`;
  updateStatChart();

  const ratio = score / activeQuestions.length;
  document.querySelector("#result-copy").textContent =
    ratio === 1
      ? "A perfect round. Every answer landed."
      : ratio >= 0.6
        ? "A strong round. You knew your stuff."
        : "Good practice. There is always another round.";
  showView("results");
}

function renderHistory() {
  const list = document.querySelector("#history-list");
  const emptyMessage = document.querySelector("#history-empty");
  const clearButton = document.querySelector("#clear-history");
  list.replaceChildren();
  emptyMessage.hidden = quizHistory.length > 0;
  clearButton.disabled = quizHistory.length === 0;
  document.querySelector("#history-count").textContent =
    quizHistory.length === 0
      ? "No completed quizzes yet"
      : `${quizHistory.length} completed ${quizHistory.length === 1 ? "quiz" : "quizzes"}`;

  for (const attempt of quizHistory) {
    const item = document.createElement("article");
    item.className = "history-item";
    const heading = document.createElement("div");
    heading.className = "history-item-head";
    const details = document.createElement("div");
    const title = document.createElement("p");
    title.className = "history-item-title";
    title.textContent = attempt.source;
    const date = document.createElement("p");
    date.className = "history-item-meta";
    date.textContent = new Date(attempt.completedAt).toLocaleString();
    details.append(title, date);
    const result = document.createElement("span");
    result.className = "history-item-score";
    result.textContent = `${attempt.score}/${attempt.questions.length}`;
    heading.append(details, result);

    const actions = document.createElement("div");
    actions.className = "history-item-actions";
    const reviewButton = document.createElement("button");
    reviewButton.className = "text-button";
    reviewButton.type = "button";
    reviewButton.textContent = "Review answers";
    const replayButton = document.createElement("button");
    replayButton.className = "text-button";
    replayButton.type = "button";
    replayButton.textContent = "Play again";
    const deleteButton = document.createElement("button");
    deleteButton.className = "text-button history-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    const review = document.createElement("div");
    review.className = "history-review";
    review.hidden = true;

    attempt.questions.forEach((question, index) => {
      const row = document.createElement("div");
      row.className = "review-question";
      const prompt = document.createElement("strong");
      prompt.textContent = `${index + 1}. ${question.prompt}`;
      const selectedAnswer = attempt.answers[index];
      const response = document.createElement("span");
      const isCorrect = selectedAnswer === question.answer;
      response.className =
        selectedAnswer === null
          ? "review-wrong"
          : isCorrect
            ? "review-correct"
            : "review-wrong";
      response.textContent =
        selectedAnswer === null
          ? `Skipped. Correct answer: ${question.options[question.answer]}`
          : `Your answer: ${question.options[selectedAnswer]}. ${isCorrect ? "Correct" : `Correct answer: ${question.options[question.answer]}`}`;
      row.append(prompt, response);
      review.append(row);
    });

    reviewButton.addEventListener("click", () => {
      review.hidden = !review.hidden;
      reviewButton.textContent = review.hidden
        ? "Review answers"
        : "Hide review";
    });
    replayButton.addEventListener("click", () =>
      beginQuiz(attempt.questions, attempt.source),
    );
    deleteButton.addEventListener("click", () => {
      quizHistory = quizHistory.filter((saved) => saved.id !== attempt.id);
      localStorage.setItem(historyKey, JSON.stringify(quizHistory));
      renderHistory();
    });
    actions.append(reviewButton, replayButton, deleteButton);
    item.append(heading, actions, review);
    list.append(item);
  }
}

document.querySelector("#clear-history").addEventListener("click", () => {
  if (quizHistory.length === 0) return;
  if (!window.confirm("Delete all saved quiz history? This cannot be undone.")) {
    return;
  }
  quizHistory = [];
  localStorage.removeItem(historyKey);
  renderHistory();
});

async function fetchQuestionsForSelectedTopics(selectedTopics) {
  const totalNeeded = 10;
  const questions = [];
  const categories = selectedTopics.length ? selectedTopics : [null];
  const perTopic = Math.max(1, Math.ceil(totalNeeded / categories.length));

  for (const topicValue of categories) {
    if (questions.length >= totalNeeded) break;
    const remaining = totalNeeded - questions.length;
    const query = new URLSearchParams({
      amount: String(Math.min(perTopic, remaining)),
      type: "multiple",
    });
    if (topicValue) query.set("category", topicValue);
    const response = await fetch(`https://opentdb.com/api.php?${query}`);
    const payload = await response.json();
    if (!response.ok || payload.response_code !== 0 || !payload.results?.length) {
      throw new Error(
        payload.response_code === 5
          ? "The trivia service is busy. Please wait a moment and try again."
          : "The trivia service could not provide questions. Please try again.",
      );
    }

    for (const item of payload.results) {
      const decode = (text) =>
        new DOMParser().parseFromString(text, "text/html").documentElement
          .textContent;
      const options = item.incorrect_answers.map(decode);
      const correctAnswer = decode(item.correct_answer);
      const answer = Math.floor(Math.random() * (options.length + 1));
      options.splice(answer, 0, correctAnswer);
      questions.push({ prompt: decode(item.question), options, answer });
    }
  }

  for (let index = questions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [questions[index], questions[swapIndex]] = [questions[swapIndex], questions[index]];
  }

  return questions.slice(0, totalNeeded);
}

document.querySelector("#online-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const status = document.querySelector("#home-status");
  button.disabled = true;
  status.classList.remove("error");
  const selectedTopics = loadSelectedTopics();
  const topicNames = selectedTopics.length
    ? selectedTopics.map((value) => getTopicLabel(value)).join(", ")
    : "any topic";
  status.textContent = `Fetching ${topicNames} questions...`;

  try {
    const questions = await fetchQuestionsForSelectedTopics(selectedTopics);
    const source = selectedTopics.length
      ? selectedTopics.length > 1
        ? `Online: ${selectedTopics.length} topics`
        : `Online: ${getTopicLabel(selectedTopics[0])}`
      : "Online: Any topic";
    beginQuiz(questions, source);
    status.textContent = "";
  } catch (error) {
    status.classList.add("error");
    status.textContent = `${error.message} Check your connection and try again.`;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(themeKey, nextTheme);
});

document.querySelector("#time-limit-select").value = String(questionTimeLimit);
document.querySelector("#time-limit-select").addEventListener("change", (event) => {
  questionTimeLimit = Number(event.currentTarget.value);
  localStorage.setItem(timerKey, String(questionTimeLimit));
});
topicSelect.addEventListener("change", (event) => {
  const nextValue = event.currentTarget.value;
  saveSelectedTopics(nextValue ? [nextValue] : []);
  renderTopicPicker();
});

document.querySelector("#sample-button").addEventListener("click", () =>
  beginQuiz(sampleQuestions, "Sample round"),
);
document.querySelector("#about-button").addEventListener("click", () =>
  showView("about"),
);
document.querySelector("#history-button").addEventListener("click", () => {
  renderHistory();
  showView("history");
});
document.querySelector("#create-button").addEventListener("click", () =>
  showView("builder"),
);
document.querySelectorAll("[data-view='home']").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.id === "leave-quiz" && !window.confirm("Leave this quiz? Your current progress will be lost.")) {
      return;
    }
    clearQuestionTimer();
    if (timeoutAdvance !== null) clearTimeout(timeoutAdvance);
    timeoutAdvance = null;
    showView("home");
  });
});

document.querySelector("#question-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = document.querySelector("#question-input").value.trim();
  const options = [0, 1, 2, 3].map((index) =>
    document.querySelector(`#option-${index}`).value.trim(),
  );
  const answer = Number(document.querySelector("#correct-choice").value);
  const status = document.querySelector("#builder-status");
  if (!prompt || options.some((option) => !option) || !Number.isInteger(answer)) {
    status.classList.add("error");
    status.textContent = "Fill in the question, all four choices, and the correct answer.";
    return;
  }
  draftQuestions.push({ prompt, options, answer });
  document.querySelector("#question-form").reset();
  status.classList.remove("error");
  status.textContent = "Question added.";
  renderDrafts();
});

function renderDrafts() {
  const list = document.querySelector("#draft-list");
  list.replaceChildren();
  draftQuestions.forEach((question, index) => {
    const row = document.createElement("div");
    row.className = "draft-row";
    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${question.prompt}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-question";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      draftQuestions.splice(index, 1);
      renderDrafts();
    });
    row.append(label, remove);
    list.append(row);
  });
  document.querySelector("#draft-count").textContent = `(${draftQuestions.length})`;
}

document.querySelector("#start-custom").addEventListener("click", () => {
  const status = document.querySelector("#builder-status");
  if (draftQuestions.length === 0) {
    status.classList.add("error");
    status.textContent = "Add at least one question before starting.";
    return;
  }
  beginQuiz(draftQuestions, "Your custom quiz");
});

document.querySelector("#answer-list").addEventListener("click", (event) => {
  const selected = event.target.closest(".answer");
  if (!selected || selectedAnswers[currentIndex] !== null) return;

  const question = activeQuestions[currentIndex];
  const answerIndex = Number(selected.dataset.index);
  selectedAnswers[currentIndex] = answerIndex;
  const correct = answerIndex === question.answer;

  clearQuestionTimer();
  showAnswerReaction(correct);
  answered = true;

  document.querySelectorAll(".answer").forEach((button) => {
    const index = Number(button.dataset.index);
    button.disabled = true;
    button.classList.toggle("correct", index === question.answer);
    button.classList.toggle("incorrect", index === answerIndex && !correct);
  });

  document.querySelector("#feedback").textContent = correct
    ? "Correct. Nice one."
    : `Not quite. The answer is ${question.options[question.answer]}.`;

  document.querySelector("#next-button").disabled = false;
  document.querySelector("#next-button").textContent =
    currentIndex === activeQuestions.length - 1 ? "See results" : "Next question";

  document.querySelector("#skip-button").hidden = true;
  document.querySelector("#skip-button").disabled = true;

  document.querySelector("#timer-chip").classList.remove("urgent");
  document.querySelector("#timer-value").textContent = "Done";
  document.querySelector("#timer-unit").hidden = true;
  document
    .querySelector("#timer-chip")
    .setAttribute("aria-label", "Question answered");
});

document.querySelector("#previous-button").addEventListener("click", () => {
  if (currentIndex === 0) return;
  currentIndex -= 1;
  renderQuestion();
});
document.querySelector("#skip-button").addEventListener("click", () => {
  if (answered) return;
  document.querySelector("#feedback").textContent = "Question skipped.";
  advanceQuestion();
});
document.querySelector("#next-button").addEventListener("click", () => {
  if (answered) advanceQuestion();
});
document.querySelector("#play-again").addEventListener("click", () =>
  beginQuiz(activeQuestions, document.querySelector("#quiz-source").textContent),
);

applyTheme(localStorage.getItem(themeKey) === "dark" ? "dark" : "light");
renderHistory();
