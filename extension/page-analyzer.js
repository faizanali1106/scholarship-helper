function normalizeHost() {
  return location.hostname.replace(/^www\./, "").toLowerCase();
}

function detectPlatform() {
  const host = normalizeHost();
  if (host.includes("bold.org")) return "bold";
  if (host.includes("fastweb.com")) return "fastweb";
  if (host.includes("goingmerry.com")) return "goingmerry";
  if (host.includes("scholarships.com")) return "scholarships.com";
  return "direct";
}

const PLATFORM_GUIDANCE = {
  bold: {
    name: "Bold.org",
    login: "Sign in or create an account, then browse scholarships.",
    navigate:
      "Find a scholarship and click Apply. When the application form is open, click \"Fill This Page\" in the extension.",
  },
  fastweb: {
    name: "Fastweb",
    login: "Sign in or create an account.",
    navigate:
      "Open a scholarship from your matches and go to the application form. Then click \"Fill This Page\".",
  },
  goingmerry: {
    name: "Going Merry",
    login: "Sign in or create an account.",
    navigate:
      "Open a scholarship application form, then click \"Fill This Page\" in the extension.",
  },
  "scholarships.com": {
    name: "Scholarships.com",
    login: "Sign in or register.",
    navigate:
      "Open a scholarship and reach the application form, then click \"Fill This Page\".",
  },
  direct: {
    name: "Scholarship site",
    login: "Sign in if this site asks you to.",
    navigate:
      "Navigate to the application form yourself. When the form is on screen, click \"Fill This Page\".",
  },
};

function isThankYouPage() {
  const text = document.body.innerText.toLowerCase();
  return (
    /thank you|application submitted|successfully submitted|we received your application|application complete/.test(
      text
    ) && !document.querySelector('input[type="password"]')
  );
}

function analyzePage() {
  const platform = detectPlatform();
  const guide = PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE.direct;
  const loginPage = window.ScholarshipAutofill?.isLoginPage?.() ?? false;
  const thankYou = isThankYouPage();

  if (thankYou) {
    return {
      state: "submitted",
      platform,
      platformName: guide.name,
      title: "Submitted?",
      message:
        "If you finished applying, click \"I'm Done\" to save and move to the next scholarship.",
      isLoginPage: false,
    };
  }

  if (loginPage) {
    return {
      state: "need_login",
      platform,
      platformName: guide.name,
      title: "Sign in first",
      message: guide.login,
      isLoginPage: true,
    };
  }

  return {
    state: "manual",
    platform,
    platformName: guide.name,
    title: "Navigate to the form",
    message: guide.navigate,
    isLoginPage: false,
  };
}

window.ScholarshipPageAnalyzer = { analyzePage, detectPlatform };
