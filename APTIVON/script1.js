/* =========================
   UI ELEMENTS
========================= */

const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navPanel = document.querySelector(".nav-panel");
const revealItems = document.querySelectorAll(".reveal");

const authForms = document.querySelectorAll(".auth-form");

const dashboardGreeting = document.querySelector("#dashboard-greeting");
const dashboardAvatar = document.querySelector("#dashboard-avatar");

const sidebar = document.querySelector("#dashboard-sidebar");
const sidebarOpen = document.querySelector("[data-sidebar-open]");
const sidebarCloseButtons = document.querySelectorAll("[data-sidebar-close]");
const logoutButtons = document.querySelectorAll("[data-logout]");


/* =========================
   HEADER SCROLL EFFECT
========================= */

const syncHeaderState = () => {
  if (!header) return;
  header.classList.toggle("scrolled", window.scrollY > 16);
};


/* =========================
   MOBILE MENU
========================= */

const syncMenuState = (isOpen) => {
  if (!navToggle || !navPanel) return;
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navPanel.classList.toggle("open", isOpen);
};

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    syncMenuState(!isOpen);
  });
}

document.querySelectorAll(".nav-links a, .nav-actions a").forEach((link) => {
  link.addEventListener("click", () => syncMenuState(false));
});


/* =========================
   REVEAL ANIMATION
========================= */

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => observer.observe(item));


/* =========================
   PASSWORD STRENGTH CHECK
========================= */

const evaluatePasswordStrength = (password) => {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { width: "18%", label: "Too weak", color: "#ef4444" };
  if (score === 2) return { width: "48%", label: "Fair", color: "#f59e0b" };
  if (score === 3) return { width: "74%", label: "Strong", color: "#38bdf8" };
  return { width: "100%", label: "Excellent", color: "#22c55e" };
};


/* =========================
   FIELD VALIDATION
========================= */

const validateField = (field) => {
  const input = field.querySelector("input");
  if (!input) return true;

  let isValid = input.checkValidity();

  if (input.name === "confirmPassword") {
    const passwordInput = field.closest("form")?.querySelector('input[name="password"]');
    isValid = isValid && passwordInput && input.value === passwordInput.value;
  }

  field.classList.toggle("invalid", !isValid && input.value.length > 0);
  field.classList.toggle("valid", isValid && input.value.length > 0);

  return isValid;
};


/* =========================
   AUTH FORM UI ONLY
   (NO LOGIN LOGIC HERE)
========================= */

authForms.forEach((form) => {
  const fields = form.querySelectorAll(".field");
  const passwordInput = form.querySelector('input[name="password"]');
  const strengthBar = form.querySelector(".strength-bar span");
  const strengthLabel = form.querySelector(".strength-label");

  fields.forEach((field) => {
    const input = field.querySelector("input");
    if (!input) return;

    input.addEventListener("input", () => {
      validateField(field);

      if (passwordInput && input.name === "password" && strengthBar && strengthLabel) {
        const strength = evaluatePasswordStrength(input.value);
        strengthBar.style.width = strength.width;
        strengthBar.style.backgroundColor = strength.color;
        strengthLabel.textContent = strength.label;

        const confirmField = form.querySelector('input[name="confirmPassword"]')?.closest(".field");
        if (confirmField) validateField(confirmField);
      }

      if (input.name === "confirmPassword") {
        validateField(field);
      }
    });

    input.addEventListener("blur", () => validateField(field));
  });

  form.addEventListener("submit", (event) => {
    const allValid = Array.from(fields).every((field) => validateField(field));

    if (!allValid) {
      event.preventDefault();
      return;
    }

    event.preventDefault();

    /* ❌ REMOVED:
       - localStorage login
       - fake authentication
       - user saving
       
       ✔ Firebase will handle this later
    */

    window.location.href = "login.html";
  });
});


/* =========================
   DASHBOARD UI HELPERS ONLY
   (NO LOCALSTORAGE LOGIN)
========================= */

const getGreetingPrefix = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const syncDashboardUI = () => {
  if (!dashboardGreeting && !dashboardAvatar) return;

  // Placeholder until Firebase Auth is connected
  const username = "Student";

  if (dashboardGreeting) {
    dashboardGreeting.textContent = `${getGreetingPrefix()}, ${username}`;
  }

  if (dashboardAvatar) {
    dashboardAvatar.textContent = username.charAt(0).toUpperCase();
  }
};


/* =========================
   SIDEBAR
========================= */

const toggleSidebar = (isOpen) => {
  if (!sidebar) return;
  sidebar.classList.toggle("open", isOpen);
  document.querySelector(".dashboard-overlay")?.classList.toggle("open", isOpen);
};

if (sidebarOpen) {
  sidebarOpen.addEventListener("click", () => toggleSidebar(true));
}

sidebarCloseButtons.forEach((button) => {
  button.addEventListener("click", () => toggleSidebar(false));
});


/* =========================
   LOGOUT (PLACEHOLDER)
   Firebase will replace this later
========================= */

logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // ❌ old system removed (localStorage)

    // 👉 Firebase logout will go here later
    window.location.href = "login.html";
  });
});


/* =========================
   INIT
========================= */

window.addEventListener("scroll", syncHeaderState, { passive: true });

window.addEventListener("load", () => {
  syncHeaderState();
  syncMenuState(false);
  syncDashboardUI();
  toggleSidebar(false);
});