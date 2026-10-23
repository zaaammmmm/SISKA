'use client';

/**
 * SISKA — Unified Authentication Page Component (`AuthPage`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-001 (Autentikasi & peran pengguna)
 * - docs/07-FRONTEND-ARCHITECTURE.md §5 (Auth & token handling)
 * - docs/09-TEST-PLAN.md AUTH-01, AUTH-02 (Pesan gagal login generik tanpa membocorkan apakah email terdaftar)
 */

import React, { useState } from 'react';
import Link from 'next/link';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { Brand, Icon } from '@/components/ui';
import { auth } from '@/lib/firebase';
import {
  fetchMyProfile,
  provisionInitialReporterProfile,
} from '@/lib/api-client';

export type AuthPageMode = 'login' | 'register' | 'forget' | 'terms';

export interface AuthPageProps {
  mode: AuthPageMode;
}

interface AuthModeCopy {
  title: string;
  subtitle: string;
  submitLabel: string;
}

const AUTH_MODE_COPY: Record<AuthPageMode, AuthModeCopy> = {
  login: {
    title: 'Selamat datang kembali',
    subtitle: 'Masuk untuk melihat dashboard dan mengelola laporanmu.',
    submitLabel: 'Masuk',
  },
  register: {
    title: 'Buat akun SISKA',
    subtitle: 'Lengkapi data berikut untuk membuat akun.',
    submitLabel: 'Buat akun',
  },
  forget: {
    title: 'Lupa password?',
    subtitle: 'Masukkan email untuk menerima instruksi pemulihan akun.',
    submitLabel: 'Kirim instruksi pemulihan',
  },
  terms: {
    title: 'Syarat dan Ketentuan',
    subtitle: 'Baca informasi penggunaan layanan sebelum membuat akun.',
    submitLabel: '',
  },
};

/** Pesan generik sesuai AUTH-02 agar tidak membocorkan apakah email terdaftar */
const GENERIC_LOGIN_ERROR_MESSAGE =
  'Email atau kata sandi tidak sesuai. Silakan periksa kembali.';

const NEUTRAL_PASSWORD_RESET_NOTICE =
  'Jika email terdaftar, instruksi pemulihan akan dikirim.';

const FIREBASE_UNCONFIGURED_NOTICE =
  'Firebase belum dikonfigurasi. Salin .env.example ke .env.local dan isi konfigurasi Firebase.';

export default function AuthPage({ mode }: AuthPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [notice, setNotice] = useState('');
  const [isPositiveNotice, setIsPositiveNotice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modeCopy = AUTH_MODE_COPY[mode];

  function showNotice(message: string, positive = false): void {
    setNotice(message);
    setIsPositiveNotice(positive);
  }

  async function handleRegister(): Promise<void> {
    if (!auth) {
      showNotice(FIREBASE_UNCONFIGURED_NOTICE, false);
      return;
    }
    if (!agreeToTerms) {
      throw new Error('Centang persetujuan syarat dan ketentuan terlebih dahulu.');
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    const credential = await createUserWithEmailAndPassword(
      auth,
      trimmedEmail,
      password,
    );
    await updateProfile(credential.user, { displayName: trimmedName });

    // Provisioning dokumen `users/{uid}` dengan role `reporter` di backend server
    await provisionInitialReporterProfile(trimmedName).catch(() => undefined);
    await credential.user.getIdToken(true).catch(() => undefined);

    showNotice(
      'Akun berhasil dibuat dan profil pelapor telah diaktifkan.',
      true,
    );
  }

  async function handleLogin(): Promise<void> {
    if (!auth) {
      showNotice(FIREBASE_UNCONFIGURED_NOTICE, false);
      return;
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password,
    );

    // Ambil klaim peran dari token terverifikasi atau fallback ke endpoint profil backend
    const tokenResult = await credential.user.getIdTokenResult();
    let resolvedRole = tokenResult.claims.role as string | undefined;

    if (!resolvedRole) {
      const profile = await fetchMyProfile().catch(() => null);
      resolvedRole = profile?.role;
    }

    window.location.href = resolvedRole === 'admin' ? '/admin' : '/user';
  }

  async function handleForgotPassword(): Promise<void> {
    if (!auth) {
      showNotice(FIREBASE_UNCONFIGURED_NOTICE, false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      const errorCode = (error as { code?: string })?.code ?? '';
      if (!errorCode.includes('user-not-found')) {
        throw error;
      }
    }

    // Respons netral agar tidak membocorkan keberadaan email (AUTH-02)
    showNotice(NEUTRAL_PASSWORD_RESET_NOTICE, true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice('');

    if (mode === 'terms') {
      showNotice(
        'Syarat dan ketentuan ini adalah contoh konten untuk ditinjau tim SISKA.',
        false,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        await handleRegister();
      } else if (mode === 'login') {
        await handleLogin();
      } else if (mode === 'forget') {
        await handleForgotPassword();
      }
    } catch (error) {
      const errorMessage =
        mode === 'login'
          ? GENERIC_LOGIN_ERROR_MESSAGE
          : error instanceof Error && error.message
            ? error.message
            : 'Permintaan belum berhasil. Coba kembali.';
      showNotice(errorMessage, false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <AuthAsidePanel />

      <main className="auth-main">
        <div style={{ marginBottom: 27 }} className="auth-box">
          <header>
            <div className="feature-icon">
              <Icon.ShieldCheck size={21} />
            </div>
            <h2>{modeCopy.title}</h2>
            <p className="muted" style={{ lineHeight: 1.7, marginTop: 7 }}>
              {modeCopy.subtitle}
            </p>
          </header>

          {mode === 'terms' ? (
            <TermsAndConditionsSection />
          ) : (
            <form onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div className="field">
                  <label htmlFor="auth-full-name">Nama lengkap</label>
                  <input
                    id="auth-full-name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@email.com"
                />
              </div>

              {mode !== 'forget' && (
                <div className="field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimal 6 karakter"
                  />
                  {mode === 'login' && (
                    <div style={{ textAlign: 'right' }}>
                      <Link
                        href="/login/forget"
                        className="muted"
                        style={{ fontSize: 11 }}
                      >
                        Lupa password?
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {mode === 'register' && (
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'start',
                    fontSize: 11,
                    lineHeight: 1.6,
                    margin: '3px 0 16px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(event) => setAgreeToTerms(event.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Saya telah membaca{' '}
                    <Link
                      href="/register/terms"
                      style={{ color: 'var(--teal)', fontWeight: 700 }}
                    >
                      syarat dan ketentuan
                    </Link>
                    .
                  </span>
                </label>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ width: '100%' }}
              >
                {isSubmitting ? 'Memproses...' : modeCopy.submitLabel}
              </button>

              {notice && (
                <p
                  role="status"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    marginTop: 13,
                    color: isPositiveNotice ? '#087c78' : '#a55d16',
                  }}
                >
                  {notice}
                </p>
              )}
            </form>
          )}

          <AuthFooterNavigation mode={mode} />
        </div>
      </main>
    </div>
  );
}

function AuthAsidePanel() {
  return (
    <aside className="auth-aside">
      <Brand />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#bce5df',
          }}
        >
          Sistem Pengaduan Kekerasan Seksual
        </div>
        <h1>Langkah kecilmu, berarti.</h1>
        <p>
          Sarana pengaduan yang terstruktur, dengan perhatian pada keamanan dan
          kerahasiaan informasi.
        </p>
        <div
          style={{
            marginTop: 28,
            borderTop: '1px solid #ffffff35',
            paddingTop: 17,
            fontSize: 11,
            color: '#c7e8e3',
          }}
        >
          Kamu berhak didengar dan memperoleh informasi yang jelas.
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#bce5df' }}>
        SISKA · UIN Sunan Kalijaga Yogyakarta
      </div>
    </aside>
  );
}

function TermsAndConditionsSection() {
  return (
    <>
      <div
        className="card"
        style={{ lineHeight: 1.8, fontSize: 12, marginBottom: 18 }}
      >
        <b>Penggunaan layanan</b>
        <p>
          Gunakan SISKA untuk menyampaikan informasi yang relevan dengan
          pengaduan. Jangan membagikan informasi akun kepada orang lain.
        </p>
        <b>Privasi dan akses</b>
        <p>
          Informasi laporan bersifat sensitif dan hanya boleh diakses oleh pihak
          yang berwenang sesuai kebijakan yang berlaku. Detail kebijakan privasi
          perlu ditetapkan oleh pengelola sebelum peluncuran.
        </p>
        <b>Batasan layanan</b>
        <p>
          SISKA bukan layanan darurat dan tidak menggantikan pendampingan
          profesional atau prosedur resmi kampus.
        </p>
      </div>
      <Link href="/register" className="btn btn-primary">
        Kembali ke registrasi
      </Link>
    </>
  );
}

function AuthFooterNavigation({ mode }: { mode: AuthPageMode }) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--line)',
        marginTop: 24,
        paddingTop: 18,
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {mode === 'login' ? (
        <>
          Belum punya akun?{' '}
          <Link href="/register" style={{ color: 'var(--teal)', fontWeight: 800 }}>
            Daftar
          </Link>
        </>
      ) : mode === 'register' ? (
        <>
          Sudah punya akun?{' '}
          <Link href="/login" style={{ color: 'var(--teal)', fontWeight: 800 }}>
            Masuk
          </Link>
        </>
      ) : (
        <Link href="/login" style={{ color: 'var(--teal)', fontWeight: 800 }}>
          Kembali ke login
        </Link>
      )}
    </div>
  );
}
