"use client";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const fallbackApiUrl =
  process.env.NODE_ENV === "production"
    ? "https://ai-analytics-platform-backend.onrender.com/api"
    : "http://localhost:5000/api";
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || fallbackApiUrl });
const sampleQuestions = ["Which category has highest value?", "Show trend over time", "What is the average of first numeric column?"];
const plans = [
  { key: "free", title: "Free", limit: "3 reports / month", price: "0" },
  { key: "basic", title: "Basic", limit: "10 reports / month", price: "299" },
  { key: "pro", title: "Pro", limit: "Unlimited reports", price: "499" },
];

export default function Home() {
  const [theme, setTheme] = useState("dark");
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", otp: "", password: "", passwordConfirm: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [signupVerified, setSignupVerified] = useState(false);
  const [signupToken, setSignupToken] = useState("");
  const [sendOtpBusy, setSendOtpBusy] = useState(false);
  const [verifyOtpBusy, setVerifyOtpBusy] = useState(false);
  const [completeSignupBusy, setCompleteSignupBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [datasets, setDatasets] = useState([]);
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState([]);
  const [question, setQuestion] = useState("");
  const [adminStats, setAdminStats] = useState(null);
  const [users, setUsers] = useState([]);
  const isAuthed = Boolean(token);
  const isAdmin = user?.role === "admin";
  const [profileOpen, setProfileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpBusy, setCpBusy] = useState(false);
  const currentPlan = user?.plan || "free";
  const cardClass =
    theme === "dark"
      ? "rounded-2xl border border-zinc-700/50 bg-zinc-900/60"
      : "rounded-2xl border border-zinc-300 bg-white shadow-sm";
  const softInput =
    theme === "dark"
      ? "rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-400"
      : "rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-900 placeholder:text-zinc-500";

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    delete api.defaults.headers.common.Authorization;
    setToken("");
    setUser(null);
    setOtpSent(false);
    setSignupVerified(false);
    setSignupToken("");
    setDataset(null);
    setDatasets([]);
    setChats([]);
  };

  const scrollToSection = (id) => {
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const SunIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );

  const MoonIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );

  const changePassword = async () => {
    const currentPassword = cpCurrent;
    const newPassword = cpNew;
    if (!currentPassword || !newPassword) return toast.error("Enter current and new password");
    if (newPassword !== cpConfirm) return toast.error("New passwords do not match");
    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return toast.error("New password must be 8+ chars, 1 uppercase, 1 number");
    }
    setCpBusy(true);
    try {
      await api.patch("/auth/change-password", { currentPassword, newPassword });
      toast.success("Password updated");
      setShowChangePassword(false);
      setCpCurrent("");
      setCpNew("");
      setCpConfirm("");
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to update password");
    } finally {
      setCpBusy(false);
    }
  };

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err?.response?.status;
        if (status === 401) {
          logout();
          toast.error("Session expired. Please sign in again.");
        }
        return Promise.reject(err);
      }
    );

    // Restore session if available.
    const tk = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (tk) {
      setToken(tk);
      api.defaults.headers.common.Authorization = `Bearer ${tk}`;
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
        }
      }
      loadDatasets().catch(() => {});
    }

    return () => api.interceptors.response.eject(interceptorId);
  }, []);

  useEffect(() => {
    if (isAuthed && isAdmin) {
      loadAdmin().catch(() => {});
    }
  }, [isAuthed, isAdmin]);

  const uploadDataset = async (file) => {
    const form = new FormData();
    form.append("file", file);
    setLoading(true);
    try {
      const { data } = await api.post("/datasets/upload", form);
      toast.success("Dataset uploaded");
      setDataset(data);
      loadDatasets();
    } catch (e) {
      toast.error(e.response?.data?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const loadDatasets = async () => {
    try {
      const { data } = await api.get("/datasets");
      setDatasets(data);
    } catch (e) {
      // 401 is handled by interceptor (auto-logout). Other errors show a toast.
      if (e.response?.status !== 401) {
        toast.error(e.response?.data?.message || "Failed to load datasets");
      }
    }
  };

  const openDataset = async (id) => {
    try {
      const { data } = await api.get(`/datasets/${id}`);
      setDataset(data);
      const chatRes = await api.get(`/chat/${id}`);
      setChats(chatRes.data);
    } catch (e) {
      if (e.response?.status !== 401) {
        toast.error(e.response?.data?.message || "Failed to open dataset");
      }
    }
  };

  const sendOtp = async () => {
    const email = authForm.email.trim();
    if (!email) return toast.error("Please enter your email");
    if (sendOtpBusy) return;
    setSendOtpBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { email });
      setOtpSent(true);
      setSignupVerified(false);
      setSignupToken("");
      setResendCooldown(30);
      toast.success(data.message || "OTP sent. Please check your email.");
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to send OTP");
      setOtpSent(false);
      setSignupVerified(false);
      setSignupToken("");
    }
    finally {
      setSendOtpBusy(false);
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const verifySignupOtp = async () => {
    const email = authForm.email.trim();
    const otp = authForm.otp.replace(/\s/g, "");
    if (!email || !otp) return toast.error("Enter email and OTP");
    if (verifyOtpBusy) return;
    setVerifyOtpBusy(true);
    try {
      const { data } = await api.post("/auth/register/verify-otp", { email, otp });
      setSignupVerified(true);
      setSignupToken(data.signupToken || "");
      toast.success("OTP verified. Now create your password.");
    } catch (e) {
      toast.error(e.response?.data?.message || "OTP verification failed");
    }
    finally {
      setVerifyOtpBusy(false);
    }
  };

  const completeSignup = async () => {
    const password = authForm.password;
    const passwordConfirm = authForm.passwordConfirm;
    if (!signupVerified || !signupToken) return toast.error("Verify OTP first");
    if (!password || !passwordConfirm) return toast.error("Enter password and confirmation");
    if (password !== passwordConfirm) return toast.error("Passwords do not match");
    if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return toast.error("Password must be 8+ chars, 1 uppercase, 1 number");
    }
    if (completeSignupBusy) return;
    setCompleteSignupBusy(true);
    try {
      const { data } = await api.post("/auth/register/complete", { signupToken, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      setToken(data.token);
      setUser(data.user);
      setOtpSent(false);
      setSignupVerified(false);
      setSignupToken("");
      setAuthForm({ email: "", otp: "", password: "", passwordConfirm: "" });
      await loadDatasets();
      toast.success("Account created successfully");
    } catch (e) {
      toast.error(e.response?.data?.message || "Signup failed");
    } finally {
      setCompleteSignupBusy(false);
    }
  };

  const loginWithPassword = async () => {
    const email = authForm.email.trim();
    const password = authForm.password;
    if (!email || !password) return toast.error("Enter email and password");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      setToken(data.token);
      setUser(data.user);
      setOtpSent(false);
      setAuthForm({ email: "", otp: "", password: "", passwordConfirm: "" });
      await loadDatasets();
      toast.success("Signed in successfully");
    } catch (e) {
      toast.error(e.response?.data?.message || "Sign in failed");
    }
  };

  const ask = async (q) => {
    if (!dataset) return;
    const questionText = (q ?? question ?? "").toString().trim();
    if (!questionText) {
      toast.error("Please enter a question");
      return;
    }
    try {
      const { data } = await api.post(`/chat/${dataset.id}`, { question: questionText });
      setChats((prev) => [...prev, { question: questionText, answer: data.answer }]);
      setQuestion("");
    } catch (e) {
      toast.error(e.response?.data?.message || "Chat request failed");
      console.error("ask error:", e);
    }
  };

  const createReport = async () => {
    if (!dataset) return;
    try {
      const response = await api.post(`/reports/${dataset.id}`, null, { responseType: "blob" });
      const contentDisp = response.headers?.["content-disposition"] || "";
      const match = contentDisp.match(/filename="?([^"]+)"?/i);
      const fileName = match ? match[1] : `report-${dataset.id}.pdf`;

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Report downloaded");
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to generate PDF");
    }
  };

  const upgrade = async (plan) => {
    await api.post("/payments/cashfree/create-order", { plan });
    await api.post("/payments/cashfree/verify", { plan, status: "SUCCESS" });
    setUser((u) => {
      const next = u ? { ...u, plan } : u;
      if (next) localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
    toast.success(`Plan upgraded to ${plan}`);
  };

  const loadAdmin = async () => {
    const [statsRes, usersRes] = await Promise.all([api.get("/admin/stats"), api.get("/admin/users")]);
    setAdminStats(statsRes.data);
    setUsers(usersRes.data);
  };
  const deleteUser = async (id) => {
    if (!confirm("Delete this user permanently?")) return;
    await api.delete(`/admin/users/${id}`);
    toast.success("User deleted");
    await loadAdmin();
  };

  const chartData = useMemo(() => {
    if (!dataset?.json_data || !dataset?.summary) return [];
    const rows = dataset.json_data.slice(0, 20);
    const cat = dataset.summary.categoricalColumns?.[0];
    const num = dataset.summary.numericColumns?.[0];
    if (!cat || !num) return [];
    const grouped = {};
    rows.forEach((r) => {
      const key = r[cat] || "Unknown";
      grouped[key] = (grouped[key] || 0) + Number(r[num] || 0);
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [dataset]);

  return (
    <main className={`${theme === "dark" ? "bg-zinc-950 text-zinc-100" : "bg-slate-100 text-slate-900"} min-h-screen p-6 transition-colors`}>
      <Toaster />
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`${cardClass} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-4 sm:p-6`}>
          <h1 className="text-2xl font-semibold tracking-tight sm:mr-12">AI Analytics Platform</h1>
          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-5 sm:gap-6">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-white transition hover:opacity-95"
            >
              <span className="inline-flex">
                {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </span>
              <span className="sr-only">{theme === "dark" ? "Light" : "Dark"} mode</span>
            </button>

            {isAuthed && (
              <div className="relative ml-1">
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className={`rounded-xl px-4 py-2 text-sm transition ${
                    theme === "dark" ? "bg-zinc-800 text-zinc-100" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {user?.email?.split("@")[0] || "Profile"}
                </button>

                {profileOpen && (
                  <div
                    className={`absolute right-0 z-10 mt-2 w-64 rounded-xl border p-3 shadow-lg ${
                      theme === "dark" ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-2">
                      <p className={`text-xs opacity-70 ${theme === "dark" ? "text-zinc-300" : "text-slate-600"}`}>Signed in as</p>
                      <p className={`truncate text-sm font-medium ${theme === "dark" ? "text-zinc-100" : "text-slate-900"}`}>{user?.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        setShowChangePassword(true);
                        setProfileOpen(false);
                      }}
                      className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-white transition hover:opacity-95"
                    >
                      Change password
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                        toast.success("Logged out");
                      }}
                      className={`mt-2 w-full rounded-lg px-3 py-2 transition ${
                        theme === "dark"
                          ? "bg-rose-600 text-white hover:opacity-95"
                          : "bg-rose-50 text-rose-700 border border-rose-200 hover:opacity-95"
                      }`}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

              {isAuthed && (
            <div className="w-full">
              <div className="hidden sm:flex items-center gap-2 mt-2">
                {isAdmin &&
                  [{ label: "Admin", id: "admin" }].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={`rounded-xl px-4 py-2 text-sm transition ${
                      theme === "dark"
                        ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                        : "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {isAdmin && (
                <div className="sm:hidden mt-2 flex items-center justify-between">
                  <button
                    onClick={() => setNavOpen((v) => !v)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                      theme === "dark"
                        ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                        : "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200"
                    }`}
                    aria-label="Open navigation"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M4 6h16" />
                      <path d="M4 12h16" />
                      <path d="M4 18h16" />
                    </svg>
                    Menu
                  </button>
                </div>
              )}

              {isAdmin && navOpen && (
                <div
                  className={`sm:hidden mt-2 rounded-2xl border p-3 ${
                    theme === "dark" ? "border-zinc-800 bg-zinc-900" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="space-y-2">
                    {[{ label: "Admin", id: "admin" }].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToSection(item.id)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                          theme === "dark"
                            ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            : "bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!isAuthed && (
          <section className={`${cardClass} p-6`}>
            <h2 className="mb-1 text-xl font-semibold">Welcome</h2>
            <p className="mb-5 text-sm opacity-80">
              {authMode === "signin"
                ? "Sign in using email and password."
                : "Sign up: we email you a code, then you choose your password."}
            </p>
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => {
                  setAuthMode("signin");
                  setOtpSent(false);
                  setAuthForm({ ...authForm, otp: "", password: "", passwordConfirm: "" });
                }}
                className={`rounded-xl px-3 py-2 text-sm ${authMode === "signin" ? "bg-indigo-600 text-white" : theme === "dark" ? "bg-zinc-800" : "bg-slate-200"}`}
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  setAuthMode("signup");
                  setOtpSent(false);
                  setAuthForm({ ...authForm, otp: "", password: "", passwordConfirm: "" });
                }}
                className={`rounded-xl px-3 py-2 text-sm ${authMode === "signup" ? "bg-emerald-600 text-white" : theme === "dark" ? "bg-zinc-800" : "bg-slate-200"}`}
              >
                Sign up
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className={softInput}
                placeholder="Email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              />

              {authMode === "signin" ? (
                <input
                  className={softInput}
                  placeholder="Password"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
              ) : otpSent ? (
                <input
                  className={softInput}
                  placeholder="Enter OTP from email"
                  value={authForm.otp}
                  onChange={(e) => setAuthForm({ ...authForm, otp: e.target.value })}
                />
              ) : null}
            </div>

            {authMode === "signup" && otpSent && signupVerified && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className={softInput}
                  placeholder="Create password (8+ chars, 1 uppercase, 1 number)"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
                <input
                  className={softInput}
                  placeholder="Confirm password"
                  type="password"
                  value={authForm.passwordConfirm}
                  onChange={(e) => setAuthForm({ ...authForm, passwordConfirm: e.target.value })}
                />
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {authMode === "signin" ? (
                <button onClick={loginWithPassword} className="rounded-xl bg-indigo-600 px-4 py-2 text-white">
                  Sign in
                </button>
              ) : (
                <>
                  <button
                    onClick={sendOtp}
                    disabled={sendOtpBusy || resendCooldown > 0}
                    className={`rounded-xl bg-indigo-600 px-4 py-2 text-white transition disabled:opacity-60 ${
                      sendOtpBusy || resendCooldown > 0 ? "cursor-not-allowed" : ""
                    }`}
                  >
                    {sendOtpBusy ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send OTP"}
                  </button>
                  {otpSent && (
                    <>
                      {!signupVerified ? (
                        <button
                          onClick={verifySignupOtp}
                          disabled={verifyOtpBusy}
                          className={`rounded-xl bg-emerald-600 px-4 py-2 text-white transition disabled:opacity-60 ${
                            verifyOtpBusy ? "cursor-not-allowed" : ""
                          }`}
                        >
                          {verifyOtpBusy ? "Verifying..." : "Verify OTP"}
                        </button>
                      ) : (
                        <button
                          onClick={completeSignup}
                          disabled={completeSignupBusy}
                          className={`rounded-xl bg-emerald-600 px-4 py-2 text-white transition disabled:opacity-60 ${
                            completeSignupBusy ? "cursor-not-allowed" : ""
                          }`}
                        >
                          {completeSignupBusy ? "Creating..." : "Create account"}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {authMode === "signup" && otpSent && (
              <p className={`mt-3 text-xs leading-relaxed ${theme === "dark" ? "text-zinc-400" : "text-slate-600"}`}>
                Use the <strong>6-digit code</strong> from the email. If the message only shows a button/link and no code, open Supabase → Authentication → Email templates → edit
                &quot;Magic Link&quot; (or OTP) and add the line: <code className="rounded bg-black/20 px-1">Your code: {"{{ .Token }}"}</code>
              </p>
            )}
          </section>
        )}

        {isAuthed && isAdmin && (
          <section id="admin" className="space-y-4">
            <div className={`${cardClass} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Admin Panel</h2>
              </div>
              {adminStats && (
                <div className="grid gap-3 sm:grid-cols-1">
                  <div className={`${theme === "dark" ? "bg-zinc-800" : "bg-slate-100"} rounded-xl p-3`}>
                    <p className="text-xs opacity-70">Total Users</p>
                    <p className="text-2xl font-semibold">{adminStats.users}</p>
                  </div>
                </div>
              )}
            </div>

            <div className={`${cardClass} overflow-hidden`}>
              <div className={`grid grid-cols-5 gap-2 px-4 py-3 text-xs font-semibold ${theme === "dark" ? "bg-zinc-800" : "bg-slate-200"}`}>
                <span>ID</span>
                <span>Email</span>
                <span>Role</span>
                <span>Plan</span>
                <span>Action</span>
              </div>
              <div className="max-h-[380px] overflow-x-auto overflow-y-auto">
                {users.map((u) => (
                  <div key={u.id} className={`grid grid-cols-5 gap-2 px-4 py-3 text-sm ${theme === "dark" ? "border-zinc-800" : "border-slate-200"} border-b`}>
                    <span>{u.id}</span>
                    <span className="truncate">{u.email}</span>
                    <span>{u.role}</span>
                    <span>{u.subscription_plan}</span>
                    <span>
                      <button onClick={() => deleteUser(u.id)} className="rounded-md bg-rose-600 px-2 py-1 text-xs text-white">Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isAuthed && !isAdmin && (
          <>
            <section id="dashboard" className={`${cardClass} p-4`}>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && uploadDataset(e.target.files[0])} />
              {loading && <p className="mt-2 animate-pulse text-sm">Processing dataset...</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {datasets.map((d) => (
                  <button key={d.id} onClick={() => openDataset(d.id)} className={`rounded-lg px-3 py-1 text-sm ${theme === "dark" ? "bg-zinc-800" : "bg-slate-200"}`}>{d.name}</button>
                ))}
              </div>
            </section>

            {dataset && (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className={`${cardClass} p-4`}>
                  <h2 className="mb-2 font-semibold">Insights</h2>
                  {(dataset.insights || []).map((i, idx) => <p key={idx} className="text-sm opacity-90">- {i}</p>)}
                  <h3 className="mt-3 text-sm font-semibold">Summary</h3>
                  <pre className="overflow-auto text-xs opacity-80">{JSON.stringify(dataset.summary, null, 2)}</pre>
                </div>
                <div className={`${cardClass} p-4`}>
                  <h2 className="mb-2 font-semibold">Auto Charts</h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height={224}>
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value}`, "Value"]} labelFormatter={(label) => `Item: ${label}`} />
                        <Bar dataKey="value" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid h-56 grid-cols-2 gap-3">
                    <ResponsiveContainer width="100%" height={224}>
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={70}>
                          {chartData.map((_, i) => <Cell key={i} fill={["#60a5fa", "#f59e0b", "#10b981", "#ef4444"][i % 4]} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value}`, "Value"]}
                          labelFormatter={(label) => `Item: ${label}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={224}>
                      <LineChart data={chartData}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value}`, "Value"]} labelFormatter={(label) => `Item: ${label}`} />
                        <Line type="monotone" dataKey="value" stroke="#22c55e" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            )}

            {dataset && (
              <section className={`${cardClass} p-4`}>
                <h2 className="mb-3 font-semibold">AI Chatbot</h2>
                <div className="mb-2 flex flex-wrap gap-2">
                  {sampleQuestions.map((q) => (
                    <button key={q} onClick={() => ask(q)} className={`rounded-lg px-2 py-1 text-xs ${theme === "dark" ? "bg-zinc-800" : "bg-slate-200"}`}>{q}</button>
                  ))}
                </div>
                <div className={`max-h-64 space-y-3 overflow-auto rounded-xl p-3 ${theme === "dark" ? "bg-zinc-900/70" : "bg-slate-100"}`}>
                  {chats.map((c, i) => (
                    <div key={i} className="space-y-1 text-sm">
                      <p className={`${theme === "dark" ? "text-blue-300" : "text-blue-700"} rounded-md px-2 py-1 ${theme === "dark" ? "bg-blue-500/10" : "bg-blue-50"}`}>Q: {c.question}</p>
                      <p className={`${theme === "dark" ? "text-emerald-300" : "text-emerald-700"} rounded-md px-2 py-1 ${theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"}`}>A: {c.answer}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask something about your data..."
                    className={`flex-1 ${softInput}`}
                  />
                  <button onClick={() => ask()} className="rounded-xl bg-indigo-600 px-4 py-2 text-white">Ask</button>
                  <button onClick={createReport} className="rounded-xl bg-purple-600 px-4 py-2 text-white">Generate PDF</button>
                </div>
              </section>
            )}

            <section id="subscription" className={`${cardClass} p-4`}>
              <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Subscription</h2>
                  <p className={`text-sm ${theme === "dark" ? "text-zinc-300" : "text-slate-600"}`}>
                    Current plan: <span className="font-medium">{currentPlan.toUpperCase()}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plans.map((p) => {
                  const isCurrent = p.key === currentPlan;
                  return (
                    <div
                      key={p.key}
                      className={`relative overflow-hidden rounded-2xl p-4 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg ${
                        theme === "dark"
                          ? isCurrent
                            ? "border border-indigo-500/70 bg-zinc-900 ring-2 ring-indigo-500 animate-pulse"
                            : "border border-zinc-800 bg-zinc-900"
                          : isCurrent
                            ? "border border-indigo-400 bg-white ring-2 ring-indigo-500 animate-pulse"
                            : "border border-slate-200 bg-white"
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute right-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-xs text-white">
                          Active
                        </div>
                      )}

                      <p className="text-base font-semibold">{p.title}</p>
                      <p className={`mt-1 text-sm ${theme === "dark" ? "text-zinc-300" : "text-slate-600"}`}>{p.limit}</p>
                      <p className="mt-3 text-3xl font-semibold">Rs {p.price}</p>

                      <button
                        disabled={isCurrent || p.key === "free"}
                        onClick={() => p.key !== "free" && upgrade(p.key)}
                        className={`mt-4 w-full rounded-xl px-3 py-2 text-sm transition ${
                          isCurrent
                            ? theme === "dark"
                              ? "bg-zinc-800 text-zinc-300 cursor-not-allowed"
                              : "bg-slate-100 text-slate-500 cursor-not-allowed"
                            : "bg-emerald-600 text-white hover:opacity-95"
                        }`}
                      >
                        {isCurrent ? "Current Plan" : p.key === "free" ? "Free plan" : "Upgrade"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      {showChangePassword && isAuthed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowChangePassword(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl p-5 ${
              theme === "dark" ? "bg-zinc-900 border border-zinc-800" : "bg-white border border-slate-200"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Change password</h3>
              <p className={`mt-1 text-sm ${theme === "dark" ? "text-zinc-300" : "text-slate-600"}`}>
                Use your current password and set a new one.
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={cpCurrent}
                onChange={(e) => setCpCurrent(e.target.value)}
                placeholder="Current password"
                className={softInput}
              />
              <input
                type="password"
                value={cpNew}
                onChange={(e) => setCpNew(e.target.value)}
                placeholder="New password"
                className={softInput}
              />
              <input
                type="password"
                value={cpConfirm}
                onChange={(e) => setCpConfirm(e.target.value)}
                placeholder="Confirm new password"
                className={softInput}
              />
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowChangePassword(false)}
                className={`flex-1 rounded-xl px-3 py-2 transition ${
                  theme === "dark"
                    ? "bg-zinc-800 text-zinc-100 hover:opacity-95"
                    : "bg-slate-100 text-slate-800 hover:opacity-95"
                }`}
                disabled={cpBusy}
              >
                Cancel
              </button>
              <button
                onClick={changePassword}
                className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-white transition hover:opacity-95 disabled:opacity-60"
                disabled={cpBusy}
              >
                {cpBusy ? "Updating..." : "Update password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
