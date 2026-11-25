(function () {
  var key = "tichuTheme";
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var preference = "system";
  try {
    var saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (error) {
    console.warn("Could not read the theme preference:", error);
  }

  function applyTheme() {
    var resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.documentElement.setAttribute("data-theme", resolved);
    document.dispatchEvent(new Event("tichu-theme-change"));
  }

  applyTheme();
  function onSystemChange() {
    if (preference === "system") applyTheme();
  }
  if (media.addEventListener) media.addEventListener("change", onSystemChange);
  else media.addListener(onSystemChange);

  document.addEventListener("DOMContentLoaded", function () {
    var picker = document.getElementById("theme-picker");
    if (picker) {
      picker.value = preference;
      picker.addEventListener("change", function () {
        preference = picker.value;
        try {
          if (preference === "system") localStorage.removeItem(key);
          else localStorage.setItem(key, preference);
        } catch (error) {
          console.warn("Could not save the theme preference:", error);
        }
        applyTheme();
      });
    }
    window.addEventListener("storage", function (event) {
      if (event.key !== key && event.key !== null) return;
      preference = event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system";
      if (picker) picker.value = preference;
      applyTheme();
    });
  });
})();
