"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { ArrowLeft, Check, KeyRound, Mail, MailCheck, ShieldCheck, User } from "lucide-react";
import { Logo } from "@/components/logo";
import { Note, PasswordField, TextField } from "@/components/ui";
import { auth } from "@/lib/firebase";

function AuthLayout({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Logo size={32} tone="white" />
        <div className="auth-aside-mid">
          <span className="auth-badge">SISTEM INFORMASI PENGADUAN</span>
          <h1>Langkah kecilmu,<br />berarti.</h1>
          <p className="lead">Ruang untuk menyampaikan laporan dan mencari informasi dukungan, sesuai kenyamananmu.</p>
          <ul className="auth-points">
            {["Didengar tanpa dihakimi", "Kamu memilih informasi yang dibagikan", "Akses ke petugas dan informasi awal"].map((t) => (
              <li key={t}><Check aria-hidden /> {t}</li>
            ))}
          </ul>
        </div>
        <div className="auth-aside-foot">Demo • data ilustrasi<br />SISKA bukan layanan darurat.</div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link href="/"><ArrowLeft aria-hidden /> Kembali ke Beranda</Link>
          <span className="crumb-tiny">{crumb}</span>
        </div>
        <div className="auth-center">{children}</div>
        <p className="auth-foot">Jangan bagikan kata sandi atau informasi sensitif yang tidak diperlukan.</p>
      </main>
    </div>
  );
}

const GENERIC_LOGIN_ERROR = "Email atau password belum sesuai. Silakan periksa kembali.";

/* ------------------------------ Login ------------------------------ */
export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!auth) {
        // Mode demo: Firebase belum dikonfigurasi → arahkan ke data ilustrasi.
        console.info("[SISKA] Firebase belum dikonfigurasi — login berjalan dalam mode demo.");
        router.push(email.trim().toLowerCase().startsWith("admin") ? "/admin" : "/user");
        return;
      }
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/user");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setError(
        code.includes("network") ? "Koneksi bermasalah. Periksa jaringanmu lalu coba lagi."
        : code.includes("too-many") ? "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."
        : GENERIC_LOGIN_ERROR,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout crumb="User Pages / Login">
      <form className="auth-form" onSubmit={submit} noValidate={false}>
        <h2>Selamat datang kembali</h2>
        <p className="sub">Masuk untuk melanjutkan langkahmu bersama SISKA.</p>
        <TextField label="Email" icon={Mail} type="email" required autoComplete="email" placeholder="nama@contoh.test"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" required autoComplete="current-password" placeholder="Masukkan password"
          value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
        <div className="auth-row">
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ingat saya di perangkat ini</label>
          <Link href="/login/forget" className="link-teal" style={{ fontSize: 11 }}>Lupa Password?</Link>
        </div>
        <button className="btn btn-primary" disabled={busy} style={{ minWidth: 80 }}>{busy ? "Memproses…" : "Login"}</button>
        <p className="auth-alt">Belum punya akun? <Link href="/register">Register</Link></p>
      </form>
    </AuthLayout>
  );
}

/* ----------------------------- Register ---------------------------- */
export function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ username: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.username.trim().length < 3) er.username = "Username minimal 3 karakter.";
    if (f.password.length < 6) er.password = "Password minimal 6 karakter.";
    if (f.confirm !== f.password) er.confirm = "Konfirmasi password belum sama.";
    if (!agree) er.agree = "Centang persetujuan Syarat dan Ketentuan terlebih dahulu.";
    setErrors(er);
    if (Object.keys(er).length) return;

    setBusy(true);
    try {
      if (!auth) {
        console.info("[SISKA] Firebase belum dikonfigurasi — registrasi berjalan dalam mode demo.");
        router.push("/user");
        return;
      }
      const c = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
      await updateProfile(c.user, { displayName: f.username.trim() });
      router.push("/user");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setErrors({
        form: code.includes("email-already") ? "Email ini sudah terdaftar. Coba login."
          : code.includes("weak") ? "Password terlalu lemah. Gunakan kombinasi yang lebih panjang."
          : "Pendaftaran belum berhasil. Coba kembali.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout crumb="User Pages / Register">
      <form className="auth-form" onSubmit={submit}>
        <h2>Buat akun SISKA</h2>
        <p className="sub">Gunakan username yang nyaman untukmu.</p>
        <TextField label="Username" icon={User} required autoComplete="username" placeholder="Masukkan username"
          value={f.username} onChange={set("username")} error={errors.username} />
        <TextField label="Email" icon={Mail} type="email" required autoComplete="email" placeholder="nama@contoh.test"
          value={f.email} onChange={set("email")} />
        <PasswordField label="Password" required autoComplete="new-password" placeholder="Buat password"
          value={f.password} onChange={set("password")} error={errors.password} help="Gunakan password unik. Jangan gunakan data pribadi." />
        <PasswordField label="Konfirmasi Password" required autoComplete="new-password" placeholder="Ulangi password"
          value={f.confirm} onChange={set("confirm")} error={errors.confirm} />
        <div style={{ margin: "19px 0" }}>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>Saya telah membaca <Link href="/register/terms" className="link-teal">Syarat dan Ketentuan</Link> (draft ilustrasi).</span>
          </label>
          {errors.agree && <p className="error-text" role="alert">{errors.agree}</p>}
        </div>
        {errors.form && <p className="error-text" role="alert" style={{ margin: "-7px 0 12px" }}>{errors.form}</p>}
        <button className="btn btn-primary" disabled={busy} style={{ minWidth: 80 }}>{busy ? "Memproses…" : "Daftar"}</button>
        <p className="auth-alt">Sudah punya akun? <Link href="/login">Login</Link></p>
      </form>
    </AuthLayout>
  );
}

/* ------------------------- Lupa password ------------------------- */
export function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (auth) await sendPasswordResetEmail(auth, email.trim());
      setSent(true); // pesan netral: tidak membocorkan apakah email terdaftar
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("user-not-found")) setSent(true);
      else setError("Permintaan belum berhasil. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout crumb="User Pages / Konfirmasi">
        <div className="auth-form">
          <MailCheck className="auth-icon auth-icon-lg" aria-hidden />
          {!auth && <span className="chip chip-teal" style={{ marginBottom: 19 }}>Contoh konfirmasi</span>}
          <h2>Periksa kotak masukmu</h2>
          <p className="sub">Jika email terdaftar, instruksi reset akan dikirim ke alamat tersebut. Ikuti petunjuk pada email untuk mengatur password baru.</p>
          <Note title="Belum menemukan email?">
            Periksa folder spam dan pastikan alamat email sudah benar.{!auth && " Pada demo ini, tidak ada email yang dikirim."}
          </Note>
          <div className="auth-actions">
            <Link href="/login" className="btn btn-primary">Kembali ke Login</Link>
            <button className="btn btn-outline" onClick={() => setSent(false)}>Gunakan email lain</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout crumb="User Pages / Lupa Password">
      <form className="auth-form" onSubmit={submit}>
        <KeyRound className="auth-icon" aria-hidden />
        <h2>Lupa password?</h2>
        <p className="sub">Masukkan email yang kamu gunakan untuk akun SISKA. Instruksi pengaturan ulang akan ditampilkan pada langkah berikutnya.</p>
        <TextField label="Email" icon={Mail} type="email" required autoComplete="email" placeholder="nama@contoh.test"
          value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Note className="" icon={ShieldCheck}>
          {auth ? "Demi keamanan, kami tidak menampilkan apakah email terdaftar atau tidak." : "Ini adalah simulasi tampilan. Tidak ada email atau instruksi yang benar-benar dikirim."}
        </Note>
        <div className="auth-actions">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Memproses…" : "Kirim Instruksi"}</button>
          <Link href="/login" className="link-arrow" style={{ paddingLeft: 12 }}><ArrowLeft aria-hidden /> Kembali ke Login</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
