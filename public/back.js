/* "Back" link on the guide and policy pages. Without JavaScript, or when the visitor
   arrived from outside the site (Google, a shared link), the link goes to its normal
   href. When they came from another PaperRally page it returns them to that page. */
(function () {
  var link = document.querySelector("[data-back]");
  if (!link) return;
  var fromThisSite = false;
  try { fromThisSite = new URL(document.referrer).origin === location.origin; } catch (e) {}
  if (!fromThisSite || history.length < 2) return;
  link.innerHTML = "&larr; Back";
  link.addEventListener("click", function (e) {
    e.preventDefault();
    history.back();
  });
})();
