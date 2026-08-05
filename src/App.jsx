import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Lock, X, Check, PiggyBank, Home, Sparkles, Archive, Printer } from "lucide-react";
import { loadKV, saveKV } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Ledger-book aesthetic: warm parchment, ink typography, a rotated "stamp"
// badge marks each entry with the category it was auto-sorted into — the
// same gesture a bookkeeper would use when reconciling a household ledger.
// ---------------------------------------------------------------------------

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap";

const CATS = {
  necessidades: { label: "Necessidades", pct: 0.5, color: "#3F6659", soft: "#E4EAE3" },
  desejos: { label: "Desejos", pct: 0.3, color: "#A9762E", soft: "#F0E7D6" },
  poupanca: { label: "Poupança", pct: 0.2, color: "#35577A", soft: "#E1E7ED" },
};

const DEFAULT_KEYWORDS = {
  necessidades: [
    "seguro", "renda", "prestacao", "prestação", "casa", "agua", "água", "luz",
    "edp", "gas", "gás", "lidl", "mercadona", "continente", "pingo doce",
    "combustivel", "combustível", "gasolina", "gasoleo", "gasóleo", "gota",
    "farmacia", "farmácia", "saude", "saúde", "escola", "internet",
    "telemovel", "telemóvel", "condominio", "condomínio", "medico", "médico",
    "renda casa", "credito", "crédito", "emprestimo", "empréstimo",
  ],
  desejos: [
    "jysk", "homa", "hôma", "ikea", "restaurante", "cafe", "café", "cinema",
    "roupa", "sapatos", "ginasio", "ginásio", "presente", "viagem",
    "netflix", "spotify", "jantar", "bar", "shopping", "perfume",
  ],
  poupanca: [
    "poupanca", "poupança", "transferencia poupanca", "investimento",
    "mealheiro", "acoes", "ações", "pplr", "certificados",
  ],
};

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function guessCategory(desc, keywords) {
  const n = normalize(desc);
  for (const cat of Object.keys(keywords)) {
    for (const kw of keywords[cat]) {
      if (n.includes(normalize(kw))) return cat;
    }
  }
  return null;
}

function monthLabel(d = new Date()) {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function euros(n) {
  return (Number(n) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------

export default function ContasCasa() {
  const [loaded, setLoaded] = useState(false);
  const [income, setIncome] = useState(2064);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [expenses, setExpenses] = useState([]); // current month
  const [history, setHistory] = useState([]); // archived months
  const [error, setError] = useState("");

  // form state
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(new Date().getDate());
  const [pendingCat, setPendingCat] = useState(null);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savingNote, setSavingNote] = useState("");
  const [printData, setPrintData] = useState(null);
  const [viewCategory, setViewCategory] = useState(null);

  // ---- print / PDF ----
  useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => window.print(), 150);
    const onAfterPrint = () => setPrintData(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printData]);

  function printMonth(data) {
    setPrintData(data);
  }

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const s = await loadKV("settings");
        if (s) {
          if (s.income != null) setIncome(s.income);
          if (s.keywords) setKeywords(s.keywords);
        }
      } catch (e) {}
      try {
        const cm = await loadKV("current-month");
        if (cm) setExpenses(cm.expenses || []);
      } catch (e) {}
      try {
        const h = await loadKV("history");
        if (h) setHistory(h);
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persistSettings = useCallback(async (nextIncome, nextKeywords) => {
    try {
      await saveKV("settings", { income: nextIncome, keywords: nextKeywords });
    } catch (e) {
      setError("Não consegui guardar as definições. Tenta novamente.");
    }
  }, []);

  const persistExpenses = useCallback(async (list) => {
    try {
      await saveKV("current-month", { expenses: list });
    } catch (e) {
      setError("Não consegui guardar a despesa. Tenta novamente.");
    }
  }, []);

  const persistHistory = useCallback(async (list) => {
    try {
      await saveKV("history", list);
    } catch (e) {
      setError("Não consegui guardar o histórico. Tenta novamente.");
    }
  }, []);

  // ---- derived ----
  const targets = useMemo(() => ({
    necessidades: income * CATS.necessidades.pct,
    desejos: income * CATS.desejos.pct,
    poupanca: income * CATS.poupanca.pct,
  }), [income]);

  const spent = useMemo(() => {
    const s = { necessidades: 0, desejos: 0, poupanca: 0 };
    for (const e of expenses) s[e.category] = (s[e.category] || 0) + Number(e.amount || 0);
    return s;
  }, [expenses]);

  const detectedCat = useMemo(() => {
    if (pendingCat) return pendingCat;
    return guessCategory(desc, keywords);
  }, [desc, keywords, pendingCat]);

  // ---- handlers ----
  function resetForm() {
    setDesc("");
    setAmount("");
    setDay(new Date().getDate());
    setPendingCat(null);
  }

  async function addExpense() {
    const value = parseFloat(String(amount).replace(",", "."));
    if (!desc.trim() || !value || value <= 0) {
      setError("Preenche a descrição e um valor válido.");
      return;
    }
    const cat = detectedCat || "necessidades";
    const entry = {
      id: uid(),
      day: Number(day) || new Date().getDate(),
      desc: desc.trim(),
      amount: value,
      category: cat,
      auto: !pendingCat,
    };
    const next = [entry, ...expenses];
    setExpenses(next);
    setError("");

    // learn: if user manually picked a category and the description isn't
    // already recognised, remember the first word as a new keyword
    if (pendingCat) {
      const firstWord = normalize(desc.trim()).split(" ")[0];
      if (firstWord && firstWord.length > 2 && guessCategory(desc, keywords) !== pendingCat) {
        const nextKw = { ...keywords, [pendingCat]: [...keywords[pendingCat], firstWord] };
        setKeywords(nextKw);
        persistSettings(income, nextKw);
      }
    }
    resetForm();
    await persistExpenses(next);
    setSavingNote("Guardado");
    setTimeout(() => setSavingNote(""), 1200);
  }

  async function removeExpense(id) {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    await persistExpenses(next);
  }

  async function updateIncome(v) {
    const val = parseFloat(String(v).replace(",", ".")) || 0;
    setIncome(val);
    await persistSettings(val, keywords);
  }

  async function closeMonth() {
    const closed = {
      id: uid(),
      monthLabel: monthLabel(),
      closedAt: new Date().toISOString(),
      income,
      totals: { ...spent },
      targets: { ...targets },
      expenses,
    };
    const nextHistory = [closed, ...history];
    setHistory(nextHistory);
    setExpenses([]);
    await persistHistory(nextHistory);
    await persistExpenses([]);
    setShowCloseModal(false);
  }

  const totalSpent = spent.necessidades + spent.desejos + spent.poupanca;

  return (
    <div style={styles.page}>
      <link rel="stylesheet" href={FONTS_HREF} />
      <style>{css}</style>

      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerRow}>
            <div>
              <p style={styles.eyebrow}>Livro de contas · {monthLabel()}</p>
              <h1 style={styles.title}>Contas cá em casa</h1>
            </div>
            <div style={styles.incomeBox}>
              <label style={styles.incomeLabel}>Rendimento do mês</label>
              <div style={styles.incomeInputWrap}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={income}
                  onChange={(e) => updateIncome(e.target.value)}
                  style={styles.incomeInput}
                  aria-label="Rendimento do mês"
                />
                <span style={styles.incomeSuffix}>€</span>
              </div>
            </div>
          </div>
        </header>

        {!loaded ? (
          <div style={styles.loading}>A abrir o livro…</div>
        ) : (
          <>
            <section style={styles.summaryGrid}>
              {Object.entries(CATS).map(([key, c]) => {
                const t = targets[key];
                const s = spent[key];
                const pctUsed = t > 0 ? Math.min(100, (s / t) * 100) : 0;
                const over = s > t;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setViewCategory(key)}
                    style={{ ...styles.summaryCard, borderColor: c.color }}
                  >
                    <div style={styles.summaryTop}>
                      <span style={{ ...styles.summaryDot, background: c.color }} />
                      <span style={styles.summaryLabel}>{c.label}</span>
                      <span style={styles.summaryPct}>{Math.round(c.pct * 100)}%</span>
                    </div>
                    <div style={styles.summaryNums}>
                      <span style={{ ...styles.summarySpent, color: over ? "#A63D33" : "#26231D" }}>
                        {euros(s)}
                      </span>
                      <span style={styles.summaryTarget}>de {euros(t)}</span>
                    </div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${pctUsed}%`,
                          background: over ? "#A63D33" : c.color,
                        }}
                      />
                    </div>
                    {over && <span style={styles.overLabel}>Passou {euros(s - t)} do alvo</span>}
                    <span style={styles.summaryHint}>Ver despesas →</span>
                  </button>
                );
              })}
            </section>

            <section style={styles.addCard}>
              <h2 style={styles.sectionTitle}>Nova despesa</h2>
              <div style={styles.formRow}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>Descrição</label>
                  <input
                    type="text"
                    placeholder="Ex: combustível, Lidl, Netflix…"
                    value={desc}
                    onChange={(e) => {
                      setDesc(e.target.value);
                      setPendingCat(null);
                    }}
                    style={styles.descInput}
                  />
                </div>
                <div style={styles.fieldGroupSmall}>
                  <label style={styles.fieldLabel}>Valor (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={styles.amountInput}
                  />
                </div>
                <div style={styles.fieldGroupTiny}>
                  <label style={styles.fieldLabel}>Dia</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    style={styles.dayInput}
                    aria-label="Dia do mês"
                  />
                </div>
              </div>

              <div style={styles.catRow}>
                <span style={styles.catRowLabel}>
                  {desc.trim() ? (detectedCat ? "Vai para:" : "Escolhe a categoria:") : "Escreve a despesa para eu sugerir a categoria"}
                </span>
                <div style={styles.chipRow}>
                  {Object.entries(CATS).map(([key, c]) => {
                    const active = detectedCat === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPendingCat(key)}
                        style={{
                          ...styles.chip,
                          borderColor: c.color,
                          background: active ? c.color : "transparent",
                          color: active ? "#FBF8F1" : c.color,
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && <p style={styles.errorText}>{error}</p>}

              <button type="button" onClick={addExpense} style={styles.addBtn}>
                <Plus size={18} strokeWidth={2.5} />
                Adicionar despesa
                {savingNote && <span style={styles.savedTag}>{savingNote}</span>}
              </button>
            </section>

            <section style={styles.listCard}>
              <div style={styles.listHeader}>
                <h2 style={styles.sectionTitle}>Despesas deste mês</h2>
                <span style={styles.listTotal}>{euros(totalSpent)}</span>
              </div>

              {expenses.length === 0 ? (
                <p style={styles.emptyText}>Ainda não há nada registado este mês. A primeira despesa fica aqui.</p>
              ) : (
                <ul style={styles.list}>
                  {expenses.map((e) => {
                    const c = CATS[e.category];
                    return (
                      <li key={e.id} style={{ ...styles.item, borderLeftColor: c.color }}>
                        <div style={styles.itemMain}>
                          <span style={styles.itemDay}>{String(e.day).padStart(2, "0")}</span>
                          <span style={styles.itemDesc}>{e.desc}</span>
                        </div>
                        <div style={styles.itemRight}>
                          <span style={styles.itemAmount}>{euros(e.amount)}</span>
                          <span
                            style={{
                              ...styles.stamp,
                              color: c.color,
                              borderColor: c.color,
                            }}
                          >
                            {c.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeExpense(e.id)}
                            style={styles.deleteBtn}
                            aria-label="Remover despesa"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <button type="button" style={styles.closeMonthBtn} onClick={() => setShowCloseModal(true)}>
              <Lock size={16} />
              Fechar mês e arquivar
            </button>

            <section style={styles.historySection}>
              <button
                type="button"
                style={styles.historyToggle}
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <Archive size={16} />
                Histórico de meses fechados ({history.length})
                {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {historyOpen && (
                <div style={styles.historyList}>
                  {history.length === 0 && (
                    <p style={styles.emptyText}>Ainda não fechaste nenhum mês.</p>
                  )}
                  {history.map((h) => {
                    const expanded = expandedHistory === h.id;
                    const total = h.totals.necessidades + h.totals.desejos + h.totals.poupanca;
                    return (
                      <div key={h.id} style={styles.historyCard}>
                        <div style={styles.historyCardHeaderRow}>
                          <button
                            type="button"
                            style={styles.historyCardHeader}
                            onClick={() => setExpandedHistory(expanded ? null : h.id)}
                          >
                            <span style={styles.historyMonth}>{h.monthLabel}</span>
                            <span style={styles.historyTotal}>{euros(total)}</span>
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                          <button
                            type="button"
                            style={styles.historyPrintBtn}
                            onClick={() => printMonth(h)}
                            aria-label={`Imprimir ${h.monthLabel}`}
                            title="Imprimir / Guardar em PDF"
                          >
                            <Printer size={15} />
                          </button>
                        </div>
                        {expanded && (
                          <div style={styles.historyBody}>
                            <div style={styles.historyTotalsRow}>
                              {Object.entries(CATS).map(([key, c]) => (
                                <div key={key} style={styles.historyTotalItem}>
                                  <span style={{ ...styles.summaryDot, background: c.color }} />
                                  <span style={styles.historyTotalLabel}>{c.label}</span>
                                  <span style={styles.historyTotalValue}>{euros(h.totals[key])}</span>
                                  <span style={styles.historyTargetValue}>/ {euros(h.targets[key])}</span>
                                </div>
                              ))}
                            </div>
                            <ul style={styles.historyExpenseList}>
                              {h.expenses.map((e) => (
                                <li key={e.id} style={styles.historyExpenseItem}>
                                  <span style={styles.itemDay}>{String(e.day).padStart(2, "0")}</span>
                                  <span style={{ flex: 1 }}>{e.desc}</span>
                                  <span>{euros(e.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        <p style={styles.shareNote}>
          Os dados ficam guardados na base de dados partilhada — qualquer pessoa com o link do site vê e edita a mesma lista.
        </p>
      </div>

      {showCloseModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCloseModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setShowCloseModal(false)} aria-label="Fechar">
              <X size={18} />
            </button>
            <h3 style={styles.modalTitle}>Fechar {monthLabel()}?</h3>
            <p style={styles.modalText}>
              Isto arquiva as {expenses.length} despesas deste mês no histórico e volta a lista a 0 para o próximo mês.
            </p>
            <div style={styles.modalTotals}>
              {Object.entries(CATS).map(([key, c]) => (
                <div key={key} style={styles.modalTotalRow}>
                  <span style={{ ...styles.summaryDot, background: c.color }} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <strong>{euros(spent[key])}</strong>
                </div>
              ))}
            </div>
            <button type="button" style={styles.modalConfirm} onClick={closeMonth}>
              <Check size={17} />
              Sim, fechar e arquivar
            </button>
          </div>
        </div>
      )}

      {viewCategory && (
        <div style={styles.modalOverlay} onClick={() => setViewCategory(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setViewCategory(null)} aria-label="Fechar">
              <X size={18} />
            </button>
            <div style={styles.catModalHeader}>
              <span style={{ ...styles.summaryDot, background: CATS[viewCategory].color, width: 11, height: 11 }} />
              <h3 style={styles.modalTitle}>{CATS[viewCategory].label}</h3>
            </div>
            <div style={styles.catModalTotals}>
              <span>Gasto: <strong>{euros(spent[viewCategory])}</strong></span>
              <span style={{ color: "#948A72" }}>Alvo: {euros(targets[viewCategory])}</span>
            </div>

            {expenses.filter((e) => e.category === viewCategory).length === 0 ? (
              <p style={styles.emptyText}>Ainda não há despesas nesta categoria este mês.</p>
            ) : (
              <ul style={styles.catModalList}>
                {expenses
                  .filter((e) => e.category === viewCategory)
                  .sort((a, b) => a.day - b.day)
                  .map((e) => (
                    <li key={e.id} style={styles.catModalItem}>
                      <span style={styles.itemDay}>{String(e.day).padStart(2, "0")}</span>
                      <span style={styles.catModalDesc}>{e.desc}</span>
                      <span style={styles.itemAmount}>{euros(e.amount)}</span>
                      <button
                        type="button"
                        onClick={() => removeExpense(e.id)}
                        style={styles.deleteBtn}
                        aria-label="Remover despesa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {printData && (
        <div className="print-root">
          <h1 className="print-title">Contas cá em casa</h1>
          <p className="print-subtitle">{printData.monthLabel}</p>
          <p className="print-income">Rendimento do mês: {euros(printData.income)}</p>

          <table className="print-summary-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Alvo</th>
                <th>Gasto</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CATS).map(([key, c]) => {
                const t = printData.targets[key];
                const s = printData.totals[key];
                return (
                  <tr key={key}>
                    <td>{c.label}</td>
                    <td>{euros(t)}</td>
                    <td>{euros(s)}</td>
                    <td>{s > t ? `+${euros(s - t)}` : `-${euros(t - s)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <table className="print-expense-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...printData.expenses]
                .sort((a, b) => a.day - b.day)
                .map((e) => (
                  <tr key={e.id}>
                    <td>{String(e.day).padStart(2, "0")}</td>
                    <td>{e.desc}</td>
                    <td>{CATS[e.category].label}</td>
                    <td>{euros(e.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p className="print-footer">Impresso em {new Date().toLocaleDateString("pt-PT")}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — parchment ledger, ink typography, red-ink stamp accent
// ---------------------------------------------------------------------------

const INK = "#26231D";
const PAPER = "#EDE6D6";
const PAPER_RAISED = "#F6F1E4";
const RULE = "#D9CFB8";
const STAMP_RED = "#A63D33";

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  input:focus, button:focus { outline: 2px solid ${STAMP_RED}; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }

  .print-root {
    position: fixed;
    left: -9999px;
    top: 0;
    width: 190mm;
    font-family: 'Inter', sans-serif;
    color: #26231D;
    background: #fff;
  }
  .print-title { font-family: 'Fraunces', serif; font-size: 22px; margin: 0 0 2px; }
  .print-subtitle { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #6B6250; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .print-income { font-size: 13px; margin: 0 0 16px; }
  .print-summary-table, .print-expense-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12.5px; }
  .print-summary-table th, .print-expense-table th {
    text-align: left; border-bottom: 2px solid #26231D; padding: 5px 6px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .print-summary-table td, .print-expense-table td { border-bottom: 1px solid #D9CFB8; padding: 5px 6px; }
  .print-footer { font-size: 10.5px; color: #948A72; margin-top: 24px; }

  @media print {
    @page { margin: 14mm; }
    body * { visibility: hidden; }
    .print-root, .print-root * { visibility: visible; }
    .print-root { position: static; left: 0; width: 100%; }
  }
`;

const styles = {
  page: {
    minHeight: "100vh",
    background: PAPER,
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(38,35,29,0.05) 1px, transparent 0)",
    backgroundSize: "18px 18px",
    fontFamily: "'Inter', system-ui, sans-serif",
    color: INK,
    padding: "24px 14px 60px",
  },
  container: { maxWidth: 640, margin: "0 auto" },
  header: { marginBottom: 20 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6B6250",
    margin: "0 0 4px",
  },
  title: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 32,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  incomeBox: {
    background: PAPER_RAISED,
    border: `1px solid ${RULE}`,
    borderRadius: 10,
    padding: "8px 12px",
    minWidth: 160,
  },
  incomeLabel: {
    display: "block",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#6B6250",
    marginBottom: 3,
  },
  incomeInputWrap: { display: "flex", alignItems: "baseline", gap: 4 },
  incomeInput: {
    border: "none",
    background: "transparent",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    fontSize: 20,
    color: INK,
    width: 100,
    padding: 0,
  },
  incomeSuffix: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: "#6B6250" },
  loading: { textAlign: "center", padding: "60px 0", fontFamily: "'IBM Plex Mono', monospace", color: "#6B6250" },

  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 18 },
  summaryCard: {
    background: PAPER_RAISED,
    border: "1.5px solid",
    borderRadius: 12,
    padding: "12px 14px",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
    display: "block",
    width: "100%",
    position: "relative",
  },
  summaryTop: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  summaryDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  summaryLabel: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14.5, flex: 1 },
  summaryPct: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#6B6250" },
  summaryNums: { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 },
  summarySpent: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 18 },
  summaryTarget: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#948A72" },
  barTrack: { height: 6, background: "#DDD3BB", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, transition: "width 0.3s ease" },
  overLabel: { display: "block", marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: STAMP_RED },
  summaryHint: {
    display: "block",
    marginTop: 8,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10.5,
    color: "#948A72",
  },

  addCard: { background: PAPER_RAISED, border: `1px solid ${RULE}`, borderRadius: 14, padding: 16, marginBottom: 16 },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, margin: "0 0 12px" },
  formRow: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" },
  fieldGroup: { flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 },
  fieldGroupSmall: { flex: "0 0 90px", display: "flex", flexDirection: "column", gap: 4 },
  fieldGroupTiny: { flex: "0 0 60px", display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6B6250",
  },
  descInput: {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${RULE}`,
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14.5,
    background: "#fff",
    color: INK,
  },
  amountInput: {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${RULE}`,
    borderRadius: 8,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14.5,
    background: "#fff",
    color: INK,
  },
  dayInput: {
    width: "100%",
    padding: "10px 8px",
    border: `1px solid ${RULE}`,
    borderRadius: 8,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14.5,
    background: "#fff",
    color: INK,
    textAlign: "center",
  },
  catRow: { marginBottom: 12 },
  catRowLabel: { display: "block", fontSize: 12.5, color: "#6B6250", marginBottom: 6 },
  chipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: {
    border: "1.5px solid",
    borderRadius: 20,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  },
  errorText: { color: STAMP_RED, fontSize: 13, margin: "0 0 10px" },
  addBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: INK,
    color: "#F6F1E4",
    border: "none",
    borderRadius: 9,
    padding: "12px 16px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 14.5,
    cursor: "pointer",
    position: "relative",
  },
  savedTag: {
    position: "absolute",
    right: 14,
    fontSize: 11.5,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#B9E0C9",
  },

  listCard: { background: PAPER_RAISED, border: `1px solid ${RULE}`, borderRadius: 14, padding: 16, marginBottom: 16 },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  listTotal: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 16 },
  emptyText: { color: "#948A72", fontSize: 13.5, fontStyle: "italic", margin: "8px 0" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  item: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    border: `1px solid ${RULE}`,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: "9px 10px",
  },
  itemMain: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  itemDay: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#948A72",
    background: "#F1ECDD",
    borderRadius: 5,
    padding: "2px 5px",
    flexShrink: 0,
  },
  itemDesc: { fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemRight: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  itemAmount: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14 },
  stamp: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    border: "1.5px solid",
    borderRadius: 4,
    padding: "2px 6px",
    transform: "rotate(-3deg)",
    display: "inline-block",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#B4A98C",
    cursor: "pointer",
    padding: 4,
    display: "flex",
  },

  closeMonthBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "transparent",
    color: STAMP_RED,
    border: `1.5px solid ${STAMP_RED}`,
    borderRadius: 10,
    padding: "11px 16px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 22,
  },

  historySection: { marginBottom: 10 },
  historyToggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    color: "#6B6250",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    padding: "8px 0",
    cursor: "pointer",
  },
  historyList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  historyCard: { background: PAPER_RAISED, border: `1px solid ${RULE}`, borderRadius: 10, overflow: "hidden" },
  historyCardHeaderRow: { display: "flex", alignItems: "center" },
  historyCardHeader: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "'Fraunces', serif",
    fontSize: 15,
    fontWeight: 600,
    color: INK,
  },
  historyPrintBtn: {
    background: "transparent",
    border: "none",
    color: "#6B6250",
    cursor: "pointer",
    padding: "8px 12px 8px 4px",
    display: "flex",
    alignItems: "center",
  },
  historyMonth: { flex: 1, textAlign: "left" },
  historyTotal: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600 },
  historyBody: { padding: "0 14px 14px" },
  historyTotalsRow: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  historyTotalItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 13 },
  historyTotalLabel: { flex: 1 },
  historyTotalValue: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 },
  historyTargetValue: { fontFamily: "'IBM Plex Mono', monospace", color: "#948A72", fontSize: 12 },
  historyExpenseList: { listStyle: "none", margin: 0, padding: 0, borderTop: `1px dashed ${RULE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 },
  historyExpenseItem: { display: "flex", gap: 8, fontSize: 12.5, color: "#4A4536" },

  shareNote: { textAlign: "center", fontSize: 11.5, color: "#948A72", marginTop: 20, lineHeight: 1.5 },

  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(38,35,29,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50,
  },
  modal: {
    background: PAPER_RAISED, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%",
    position: "relative", border: `1px solid ${RULE}`,
  },
  modalClose: { position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#948A72", cursor: "pointer" },
  modalTitle: { fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: "0 0 8px" },
  modalText: { fontSize: 13.5, color: "#4A4536", lineHeight: 1.5, margin: "0 0 16px" },
  modalTotals: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, background: "#fff", borderRadius: 10, padding: 12, border: `1px solid ${RULE}` },
  modalTotalRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 },
  modalConfirm: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: STAMP_RED, color: "#FBF3EF", border: "none", borderRadius: 9,
    padding: "12px 16px", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14.5, cursor: "pointer",
  },

  catModalHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  catModalTotals: { display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 14, paddingBottom: 10, borderBottom: `1px dashed ${RULE}` },
  catModalList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" },
  catModalItem: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: "8px 10px" },
  catModalDesc: { flex: 1, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
};
