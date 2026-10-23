'use client';

/**
 * SISKA — Modular Authentication Views (`LoginPage`, `RegisterPage`, `ForgotPage`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-001
 * - docs/07-FRONTEND-ARCHITECTURE.md §5
 * - docs/09-TEST-PLAN.md AUTH-01, AUTH-02
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  KeyRound,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { Note, PasswordField, TextField } from '@/components/ui';
import { auth } from '@/lib/firebase';
import {
  fetchMyProfile,
  provisionInitialReporterProfile,
} from '@/lib/api-client';

const GENERIC_LOGIN_ERROR =
  'Email atau password belum sesuai. Silakan periksa kembali.';

const AUTH_HIGHLIGHTS = [
  'Didengar tanpa dihakimi',
  'Kamu memilih informasi yang dibagikan',
  'Akses ke petugas dan informasi awal',
] as const;

function AuthLayout({
  crumb,
  children,
}: {
  crumb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Logo size={32} tone="white" />
        <div className="auth-aside-mid">
          <span className="auth-badge">SISTEM INFORMASI PENGADUAN</span>
          <h1>
            Langkah kecilmu,
            <br />
            berarti.
          </h1>
          <p className="lead">
            Ruang untuk menyampaikan laporan dan mencari informasi dukungan,
            sesuai kenyamananmu.
          </p>
          <ul className="auth-points">
            {AUTH_HIGHLIGHTS.map((point) => (
              <li key={point}>
                <Check aria-hidden /> {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-aside-foot">
          Demo • data ilustrasi
          <br />
          SISKA bukan layanan darurat.
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link href="/">
            <ArrowLeft aria-hidden /> Kembali ke Beranda
          </Link>
          <span className="crumb-tiny">{crumb}</span>
        </div>
        <div className="auth-center">{children}</div>
        <p className="auth-foot">
          Jangan bagikan kata sandi atau informasi sensitif yang tidak
          diperlukan.
        </p>
      </main>
    </div>
  );
}

/* ------------------------------ Login ------------------------------ */

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const normalizedEmail = email.trim();
      if (!auth) {
        console.info(
          '[SISKA] Firebase belum dikonfigurasi — login berjalan dalam mode demo.',
        );
        router.push(
          normalizedEmail.toLowerCase().startsWith('admin') ? '/admin' : '/user',
        );
        return;
      }

      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence,
      );
      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );

      const tokenResult = await credential.user.getIdTokenResult();
      let resolvedRole = tokenResult.claims.role as string | undefined;

      if (!resolvedRole) {
        const profile = await fetchMyProfile().catch(() => null);
        resolvedRole = profile?.role;
      }

      router.push(resolvedRole === 'admin' ? '/admin' : '/user');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(
        code.includes('network')
          ? 'Koneksi bermasalah. Periksa jaringanmu lalu coba lagi.'
          : code.includes('too-many')
            ? 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.'
            : GENERIC_LOGIN_ERROR,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout crumb="User Pages / Login">
      <form className="auth-form" onSubmit={handleSubmit} noValidate={false}>
        <h2>Selamat datang kembali</h2>
        <p className="sub">Masuk untuk melanjutkan langkahmu bersama SISKA.</p>
        <TextField
          label="Email"
          icon={Mail}
          type="email"
          required
          autoComplete="email"
          placeholder="nama@contoh.test"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Masukkan password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
        />
        <div className="auth-row">
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />{' '}
            Ingat saya di perangkat ini
          </label>
          <Link
            href="/login/forget"
            className="link-teal"
            style={{ fontSize: 11 }}
          >
            Lupa Password?
          </Link>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy}
          style={{ minWidth: 80 }}
        >
          {busy ? 'Memproses…' : 'Login'}
        </button>
        <p className="auth-alt">
          Belum punya akun? <Link href="/register">Register</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

/* ----------------------------- Register ---------------------------- */

interface RegisterFormState {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

export function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterFormState>({
    username: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const handleFieldChange =
    (field: keyof RegisterFormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  function validateForm(): Record<string, string> {
    const validationErrors: Record<string, string> = {};
    if (form.username.trim().length < 3) {
      validationErrors.username = 'Username minimal 3 karakter.';
    }
    if (form.password.length < 6) {
      validationErrors.password = 'Password minimal 6 karakter.';
    }
    if (form.confirm !== form.password) {
      validationErrors.confirm = 'Konfirmasi password belum sama.';
    }
    if (!agree) {
      validationErrors.agree =
        'Centang persetujuan Syarat dan Ketentuan terlebih dahulu.';
    }
    return validationErrors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateForm();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setBusy(true);
    try {
      if (!auth) {
        console.info(
          '[SISKA] Firebase belum dikonfigurasi — registrasi berjalan dalam mode demo.',
        );
        router.push('/user');
        return;
      }

      const trimmedUsername = form.username.trim();
      const credential = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password,
      );
      await updateProfile(credential.user, { displayName: trimmedUsername });

      // Provisioning profil pelapor di backend (`POST /api/v1/profile`)
      await provisionInitialReporterProfile(trimmedUsername).catch(
        () => undefined,
      );
      await credential.user.getIdToken(true).catch(() => undefined);

      router.push('/user');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setErrors({
        form: code.includes('email-already')
          ? 'Email ini sudah terdaftar. Coba login.'
          : code.includes('weak')
            ? 'Password terlalu lemah. Gunakan kombinasi yang lebih panjang.'
            : 'Pendaftaran belum berhasil. Coba kembali.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout crumb="User Pages / Register">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Buat akun SISKA</h2>
        <p className="sub">Gunakan username yang nyaman untukmu.</p>
        <TextField
          label="Username"
          icon={User}
          required
          autoComplete="username"
          placeholder="Masukkan username"
          value={form.username}
          onChange={handleFieldChange('username')}
          error={errors.username}
        />
        <TextField
          label="Email"
          icon={Mail}
          type="email"
          required
          autoComplete="email"
          placeholder="nama@contoh.test"
          value={form.email}
          onChange={handleFieldChange('email')}
        />
        <PasswordField
          label="Password"
          required
          autoComplete="new-password"
          placeholder="Buat password"
          value={form.password}
          onChange={handleFieldChange('password')}
          error={errors.password}
          help="Gunakan password unik. Jangan gunakan data pribadi."
        />
        <PasswordField
          label="Konfirmasi Password"
          required
          autoComplete="new-password"
          placeholder="Ulangi password"
          value={form.confirm}
          onChange={handleFieldChange('confirm')}
          error={errors.confirm}
        />
        <div style={{ margin: '19px 0' }}>
          <label className="check">
            <input
              type="checkbox"
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
            />
            <span>
              Saya telah membaca{' '}
              <Link href="/register/terms" className="link-teal">
                Syarat dan Ketentuan
              </Link>{' '}
              (draft ilustrasi).
            </span>
          </label>
          {errors.agree && (
            <p className="error-text" role="alert">
              {errors.agree}
            </p>
          )}
        </div>
        {errors.form && (
          <p
            className="error-text"
            role="alert"
            style={{ margin: '-7px 0 12px' }}
          >
            {errors.form}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={busy}
          style={{ minWidth: 80 }}
        >
          {busy ? 'Memproses…' : 'Daftar'}
        </button>
        <p className="auth-alt">
          Sudah punya akun? <Link href="/login">Login</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

/* ------------------------- Lupa password ------------------------- */

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (auth) {
        await sendPasswordResetEmail(auth, email.trim());
      }
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code.includes('user-not-found')) {
        setSent(true);
      } else {
        setError('Permintaan belum berhasil. Coba kembali.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout crumb="User Pages / Konfirmasi">
        <div className="auth-form">
          <MailCheck className="auth-icon auth-icon-lg" aria-hidden />
          {!auth && (
            <span className="chip chip-teal" style={{ marginBottom: 19 }}>
              Contoh konfirmasi
            </span>
          )}
          <h2>Periksa kotak masukmu</h2>
          <p className="sub">
            Jika email terdaftar, instruksi reset akan dikirim ke alamat
            tersebut. Ikuti petunjuk pada email untuk mengatur password baru.
          </p>
          <Note title="Belum menemukan email?">
            Periksa folder spam dan pastikan alamat email sudah benar.
            {!auth && ' Pada demo ini, tidak ada email yang dikirim.'}
          </Note>
          <div className="auth-actions">
            <Link href="/login" className="btn btn-primary">
              Kembali ke Login
            </Link>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setSent(false)}
            >
              Gunakan email lain
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout crumb="User Pages / Lupa Password">
      <form className="auth-form" onSubmit={handleSubmit}>
        <KeyRound className="auth-icon" aria-hidden />
        <h2>Lupa password?</h2>
        <p className="sub">
          Masukkan email yang kamu gunakan untuk akun SISKA. Instruksi
          pengaturan ulang akan ditampilkan pada langkah berikutnya.
        </p>
        <TextField
          label="Email"
          icon={Mail}
          type="email"
          required
          autoComplete="email"
          placeholder="nama@contoh.test"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />
        <Note className="" icon={ShieldCheck}>
          {auth
            ? 'Demi keamanan, kami tidak menampilkan apakah email terdaftar atau tidak.'
            : 'Ini adalah simulasi tampilan. Tidak ada email atau instruksi yang benar-benar dikirim.'}
        </Note>
        <div className="auth-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Memproses…' : 'Kirim Instruksi'}
          </button>
          <Link
            href="/login"
            className="link-arrow"
            style={{ paddingLeft: 12 }}
          >
            <ArrowLeft aria-hidden /> Kembali ke Login
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
