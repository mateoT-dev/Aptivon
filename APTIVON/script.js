import {
  auth,
  db,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  limit,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "./firebase.js";

/* ================= CONFIG ================= */

const GEMINI_API_KEY = "AIzaSyDrBuzDV_BSsTtVquPtLnOW7vLAQn7Gum4";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
/* ================= STATE ================= */

const page = document.body.dataset.page;

const protectedPages = new Set([
  "dashboard",
  "quiz",
  "leaderboard",
  "qa",
  "profile"
]);

let currentUser = null;

const $ = (s) => document.querySelector(s);

/* ================= USER ================= */

async function ensureUserDoc(user, username = "") {
  const ref = doc(db, "users", user.uid);

  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const data = {
      username: username || user.email.split("@")[0],
      email: user.email,

      points: 0,

      totalCorrect: 0,
      totalQuestions: 0,
      accuracy: 0,

      quizzesTaken: 0,

      performanceHistory: [],
      activity: [],

      createdAt: serverTimestamp()
    };

    await setDoc(ref, data);

    return data;
  }

  return snap.data();
}

async function getFreshUserData() {
  if (!currentUser?.uid) return null;

  const ref = doc(db, "users", currentUser.uid);

  const snap = await getDoc(ref);

  return snap.exists() ? snap.data() : null;
}

/* ================= AUTH ================= */

function attachAuthHandlers() {
  const registerForm = $("#registerForm");
  const loginForm = $("#loginForm");

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = $("#registerEmail")?.value.trim();
      const username = $("#registerUsername")?.value.trim();
      const password = $("#registerPassword")?.value;

      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        await ensureUserDoc(cred.user, username);

        await signOut(auth);

        window.location.href = "login.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = $("#loginEmail")?.value.trim();
      const password = $("#loginPassword")?.value;

      try {
        await signInWithEmailAndPassword(auth, email, password);

        window.location.href = "dashboard.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

/* ================= GEMINI ================= */

async function generateQuizQuestions(category, difficulty = "easy") {
  try {
    const prompt = `
Generate exactly 10 multiple choice quiz questions.

Category: ${category}
Difficulty: ${difficulty}

Return ONLY a valid JSON array.

Rules:
- No markdown
- No explanations
- No code fences
- No trailing commas
- Each question must have exactly 4 options
- "correct" must be the index of the correct option (0-3)

Example:
[
  {
    "question": "What is 2 + 2?",
    "options": ["1", "2", "3", "4"],
    "correct": 3
  }
]
`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();

    console.log("Gemini response:", data);

    if (!response.ok) {
      throw new Error(
        data?.error?.message || "Gemini API request failed"
      );
    }

    const raw =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      throw new Error("Empty response from Gemini");
    }

    let questions;

    try {
      questions = JSON.parse(raw);
    } catch (err) {
      console.error("Invalid JSON:");
      console.error(raw);
      throw new Error("Failed to parse JSON");
    }

    if (!Array.isArray(questions)) {
      throw new Error("Expected array");
    }

    return questions;

  } catch (err) {
    console.error("Quiz generation error:", err);

    alert("Quiz generation failed.");

    return [];
  }
}

/* ================= QUIZ ================= */

let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let correctAnswers = 0;
let answerLocked = false;
let quizSubmitted = false;

async function startQuiz() {
  const category =
    $("#categorySelect")?.value || "mixed";

  let difficulty = "medium";

  const user = await getFreshUserData();

  if (user?.accuracy >= 80) difficulty = "hard";
  else if (user?.accuracy <= 40) difficulty = "easy";

  $("#quizFeedback").textContent =
    "Generating AI quiz...";

  quizQuestions = await generateQuizQuestions(
    category,
    difficulty
  );

  if (!quizQuestions.length) {
    alert("Could not generate quiz.");
    return;
  }

  currentIndex = 0;
  score = 0;
  correctAnswers = 0;
  quizSubmitted = false;

  $("#quizStartPanel").style.display = "none";
  $("#quizArea").style.display = "grid";

  loadQuestion();
}

function loadQuestion() {
  answerLocked = false;

  const q = quizQuestions[currentIndex];

  if (!q) return;

  $("#quizQuestion").textContent =
    `${currentIndex + 1}. ${q.question}`;

  const container = $("#quizOptions");

  container.innerHTML = "";

  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");

    btn.className = "option-button";

    btn.textContent = opt;

    btn.onclick = () => selectAnswer(i);

    container.appendChild(btn);
  });

  $("#nextQuestionButton").disabled = true;

  $("#quizFeedback").textContent =
    `Question ${currentIndex + 1} of ${quizQuestions.length}`;
}

function selectAnswer(index) {
  if (answerLocked) return;

  answerLocked = true;

  const q = quizQuestions[currentIndex];

  const buttons =
    document.querySelectorAll(".option-button");

  buttons.forEach((b, i) => {
    b.disabled = true;

    if (i === q.correct) {
      b.style.border = "1px solid #38d996";
      b.style.background =
        "rgba(56,217,150,0.18)";
    }

    if (i === index && i !== q.correct) {
      b.style.border = "1px solid #ff6b81";
      b.style.background =
        "rgba(255,107,129,0.18)";
    }
  });

  if (index === q.correct) {
    score += 20;
    correctAnswers++;

    $("#quizFeedback").textContent =
      "Correct answer.";
  } else {
    $("#quizFeedback").textContent =
      "Incorrect answer.";
  }

  updateQuizUI();

  $("#nextQuestionButton").disabled = false;
}

function updateQuizUI() {
  $("#quizScore").textContent = score;

  const acc = Math.round(
    (correctAnswers / (currentIndex + 1)) * 100
  );

  $("#quizAccuracy").textContent =
    acc + "%";
}

async function finishQuiz() {
  if (quizSubmitted) return;

  quizSubmitted = true;

  const total = quizQuestions.length;

  await updateUserAfterQuiz({
    score,
    correct: correctAnswers,
    total
  });

  // optional: small delay so Firestore finishes syncing
  await new Promise((r) => setTimeout(r, 500));

  window.location.href = "dashboard.html";
}
/* ================= UPDATE USER ================= */

async function updateUserAfterQuiz({
  score,
  correct,
  total
}) {
  const ref = doc(db, "users", currentUser.uid);

  const user = await getFreshUserData();

  if (!user) return;

  const newCorrect =
    (user.totalCorrect || 0) + correct;

  const newTotal =
    (user.totalQuestions || 0) + total;

  const accuracy = Math.round(
    (newCorrect / newTotal) * 100
  );

  await updateDoc(ref, {
    points: (user.points || 0) + score,

    totalCorrect: newCorrect,

    totalQuestions: newTotal,

    accuracy,

    quizzesTaken:
      (user.quizzesTaken || 0) + 1,

    performanceHistory: arrayUnion({
      date: new Date().toISOString(),
      score,
      accuracy
    }),

    activity: arrayUnion({
      type: "quiz",
      score,
      date: new Date().toISOString()
    })
  });
}

/* ================= Q&A ================= */

function initQA() {
  const toggleBtn = $("#toggleQuestionForm");
  const panel = $("#questionFormPanel");
  const form = $("#questionForm");

  if (toggleBtn && panel) {
    toggleBtn.addEventListener("click", () => {
      panel.classList.toggle("hidden");
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title =
        $("#questionTitle")?.value.trim();

      const content =
        $("#questionContent")?.value.trim();

      if (!title || !content) return;

      try {
        await addDoc(collection(db, "qa"), {
          title,
          content,

          author:
            currentUser?.email || "Anonymous",

          userId: currentUser.uid,

          answers: [],

          createdAt: serverTimestamp()
        });

        form.reset();

        panel.classList.add("hidden");

        loadQuestions();

      } catch (err) {
        console.error(err);
        alert("Failed posting question.");
      }
    });
  }

  loadQuestions();
}

async function loadQuestions() {
  const container = $("#questionsList");

  if (!container) return;

  container.innerHTML = "";

  try {
    const q = query(
      collection(db, "qa"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      const card = document.createElement("div");

      card.className =
        "panel glass question-card";

      const answers = data.answers || [];

      card.innerHTML = `
        <div class="question-card-head">
          <div>
            <h3>${data.title}</h3>
            <p>${data.content}</p>
            <small>
              Posted by ${data.author}
            </small>
          </div>

          <div class="answer-count">
            ${answers.length} Answers
          </div>
        </div>

        <div class="answer-stack">
          ${answers
            .map(
              (a) => `
                <div class="answer-item">
                  <strong>${a.author}</strong>
                  <p>${a.text}</p>
                </div>
              `
            )
            .join("")}
        </div>

        <form class="answer-form">
          <textarea
            placeholder="Write an answer..."
            required
          ></textarea>

          <button class="button button-primary glow">
            Post Answer
          </button>
        </form>
      `;

      const answerForm =
        card.querySelector(".answer-form");

      answerForm.addEventListener(
        "submit",
        async (e) => {
          e.preventDefault();

          const textarea =
            answerForm.querySelector("textarea");

          const text = textarea.value.trim();

          if (!text) return;

          try {
            await updateDoc(
              doc(db, "qa", docSnap.id),
              {
                answers: arrayUnion({
                  text,
                  author:
                    currentUser.email,
                  createdAt:
                    new Date().toISOString()
                })
              }
            );

            loadQuestions();

          } catch (err) {
            console.error(err);

            alert("Failed posting answer.");
          }
        }
      );

      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
  }
}

/* ================= DASHBOARD ================= */

async function getSortedUsers() {
  const snap = await getDocs(
    query(
      collection(db, "users"),
      orderBy("points", "desc")
    )
  );

  const users = [];

  snap.forEach((d) =>
    users.push({
      id: d.id,
      ...d.data()
    })
  );

  return users;
}

function loadDashboard(user) {
  if (!user) return;

  $("#dashboardUsername") &&
    ($("#dashboardUsername").textContent =
      user.username);

  $("#statPoints") &&
    ($("#statPoints").textContent =
      user.points || 0);

  $("#statAccuracy") &&
    ($("#statAccuracy").textContent =
      (user.accuracy || 0) + "%");

  loadChart(user);

  loadLeaderboardPreview();

  loadUserRank();
}

/* ================= RANK ================= */

async function loadUserRank() {
  const users = await getSortedUsers();

  const uid =
    auth.currentUser?.uid ||
    currentUser?.uid;

  let rank =
    users.findIndex((u) => u.id === uid);

  rank = rank >= 0 ? rank + 1 : null;

  const rankEl = $("#statRank");

  if (rankEl) {
    rankEl.textContent =
      rank ? `#${rank}` : "#--";
  }
}

/* ================= PROFILE ================= */

function loadProfile(user) {
  if (!user) return;

  $("#profileUsername") &&
    ($("#profileUsername").textContent =
      user.username);

  $("#profileEmail") &&
    ($("#profileEmail").textContent =
      user.email);

  $("#profilePoints") &&
    ($("#profilePoints").textContent =
      user.points || 0);

  $("#profileQuizzes") &&
    ($("#profileQuizzes").textContent =
      user.quizzesTaken || 0);

  $("#profileAccuracy") &&
    ($("#profileAccuracy").textContent =
      (user.accuracy || 0) + "%");
}

/* ================= CHART ================= */

function loadChart(user) {
  const container = $("#progressChart");

  if (!container) return;

  container.innerHTML = "";

  const history =
    user?.performanceHistory || [];

  let points = history.map((h) => h.score);

  if (!points.length) {
    points = [10, 20, 15, 30];
  }

  const bars = document.createElement("div");

  bars.className = "chart-bars";

  points.forEach((p) => {
    const wrap = document.createElement("div");

    wrap.className = "chart-bar";

    wrap.innerHTML = `
      <div style="--bar-height:${p * 2}px"></div>
      <span>${p}</span>
    `;

    bars.appendChild(wrap);
  });

  container.appendChild(bars);
}

/* ================= LEADERBOARD PREVIEW ================= */

async function loadLeaderboardPreview() {
  const c = $("#leaderboardPreview");

  if (!c) return;

  c.innerHTML = "";

  const snap = await getDocs(
    query(
      collection(db, "users"),
      orderBy("points", "desc"),
      limit(3)
    )
  );

  let index = 0;

  snap.forEach((docSnap) => {
    const u = docSnap.data();

    index++;

    const div = document.createElement("div");

    div.className = "mini-list-item";

    div.innerHTML = `
      <strong>#${index}</strong>
      <span>${u.username}</span>
      <strong>${u.points || 0}</strong>
    `;

    c.appendChild(div);
  });
}

/* ================= FULL LEADERBOARD ================= */

async function loadFullLeaderboard() {
  const list = $("#leaderboardList");

  if (!list) return;

  list.innerHTML = "";

  const snap = await getDocs(
    query(
      collection(db, "users"),
      orderBy("points", "desc")
    )
  );

  const users = [];

  snap.forEach((doc) =>
    users.push({
      id: doc.id,
      ...doc.data()
    })
  );

  users.forEach((u, i) => {
    const row = document.createElement("div");

    row.className = "leaderboard-row";

    if (u.id === currentUser.uid) {
      row.classList.add("current-user");
    }

    row.innerHTML = `
      <div class="leaderboard-user">
        <strong>#${i + 1}</strong>
        <span>${u.username}</span>
      </div>

      <strong>${u.points || 0}</strong>
    `;

    list.appendChild(row);
  });
}

/* ================= LOGOUT ================= */

function attachLogout() {
  const btn = $("#logoutButton");

  if (!btn) return;

  btn.onclick = async () => {
    await signOut(auth);

    window.location.href = "login.html";
  };
}

/* ================= SIDEBAR ================= */

function initSidebar() {
  const toggle = $("#menuToggle");
  const sidebar = $("#sidebar");

  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

/* ================= AUTH ================= */

function handleAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (protectedPages.has(page)) {
      if (!user) {
        window.location.href =
          "login.html";

        return;
      }

      currentUser = user;

      await ensureUserDoc(user);

      attachLogout();

      initSidebar();

      if (page === "quiz") {
        $("#startQuizBtn")
          ?.addEventListener(
            "click",
            startQuiz
          );

        $("#nextQuestionButton")
          ?.addEventListener(
            "click",
            async () => {
              currentIndex++;

              if (
                currentIndex <
                quizQuestions.length
              ) {
                loadQuestion();
              } else {
                await finishQuiz();
              }
            }
          );
      }

      if (page === "qa") {
        initQA();
      }

      const fresh =
        await getFreshUserData();

      if (page === "dashboard") {
        loadDashboard(fresh);
      }

      if (page === "profile") {
        loadProfile(fresh);
      }

      if (page === "leaderboard") {
        loadFullLeaderboard();
      }
    }

    if (
      user &&
      (page === "login" ||
        page === "register")
    ) {
      window.location.href =
        "dashboard.html";
    }
  });
}

/* ================= INIT ================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    attachAuthHandlers();

    handleAuth();

    attachLogout();

    initSidebar();
  }
);