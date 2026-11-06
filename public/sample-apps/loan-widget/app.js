// Sample third-party app: everything goes through grid.js; the desktop asks the user for each permission once.
(function () {
  var out = document.getElementById("out");
  var val = function (id) { return Number(document.getElementById(id).value); };
  var peso = function (n) { return "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 }); };
  var input = function () {
    return { propertyPrice: val("price"), downPaymentPercent: val("down"), annualInterestRatePercent: val("rate"), termYears: val("years") };
  };
  grid.ready.then(function () {
    out.textContent = "Ready. Signed in as " + (grid.user ? grid.user.displayName : "?") + ".";
  }).catch(function (e) { out.textContent = e.message; });

  document.getElementById("f").addEventListener("submit", function (e) {
    e.preventDefault();
    out.textContent = "Calculating…";
    grid.tools.run("compute_loan_amortization", input()).then(function (r) {
      out.textContent = "Monthly payment: " + peso(r.monthlyPayment) + "\nLoan: " + peso(r.loanAmount) + " over " + r.months + " months";
    }).catch(function (err) { out.textContent = "Not done: " + err.message; });
  });

  document.getElementById("ask").addEventListener("click", function () {
    var i = input();
    out.textContent = "Asking the AI…";
    grid.ai.chat("Monthly payment on " + peso(i.propertyPrice) + ", " + i.downPaymentPercent + "% down, " + i.annualInterestRatePercent + "%, " + i.termYears + " years")
      .then(function (t) { out.textContent = t.reply + "\n\n(cost " + (t.estimatedCostPhp === null ? "n/a" : peso(t.estimatedCostPhp)) + ")"; })
      .catch(function (err) { out.textContent = "Not done: " + err.message; });
  });
})();
