/**
 * SISKA — Automated Verification Suite for Cloudinary Integration (Stages 1–5)
 * Menguji:
 * 1. Tahap 1: Cloudinary Adapter, Signature SHA-1, Resource Type Mapping (Image vs Raw PDF), EXIF Stripping & Blur URL
 * 2. Tahap 2: Bukti Laporan (K1 Private Upload, Signed URL <= 300s + attachment=true, SEC-F05/F06/F07, & Compensating Rollback FILE-04)
 * 3. Tahap 3: Lampiran Foto di Ruang Chat (Private Attachment Upload, Signed URL Peserta, & Anti-IDOR 404)
 * 4. Tahap 4: Foto Profil Pengguna (Auto-Crop Avatar) & Gambar Sampul Materi Edukasi (CDN Optimized + Auto-Delete)
 * 5. Tahap 5: CSP Headers pada next.config.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import {
  buildDataset,
  UID,
} from '../../../seed-data.mjs';

import {
  resetMockFirebaseAdmin,
  seedMockDocs,
  getMockDoc,
  setSimulateNextCommitFailure,
} from '../firebase-admin-mock.mjs';

import { ApiError } from '@/server/errors/api-error';
import {
  resolveCloudinaryConfig,
  resolveActiveStorageProvider,
  signCloudinaryParams,
  toCloudinaryPublicId,
  buildCloudinarySignedDownloadUrl,
  buildCloudinaryPublicImageUrl,
} from '@/lib/cloudinary';
import {
  registerEvidenceUpload,
  authorizeEvidenceDownload,
} from '@/server/services/evidence.service';
import {
  createOrOpenConversation,
  sendMessage,
  authorizeMessageAttachmentDownload,
} from '@/server/services/conversation.service';
import { updateMyProfile } from '@/server/services/profile.service';
import {
  createEducationMaterial,
  deleteEducationMaterial,
} from '@/server/services/education.service';

// Set env emulator default untuk Firestore/Auth mock pada worker test ini
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID = 'demo-siska';

// Valid JPEG & PNG binary fixtures (lolos Magic Bytes assertValidFileSignature)
const VALID_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const CALLER_ADMIN_1 = {
  uid: UID.admin1,
  email: 'admin.a@siska.test',
  role: 'admin',
  claimVerified: true,
};

const CALLER_ADMIN_2 = {
  uid: UID.admin2,
  email: 'admin.b@siska.test',
  role: 'admin',
  claimVerified: true,
};

const CALLER_REPORTER_A = {
  uid: UID.reporterA,
  email: 'reporter.a@siska.test',
  role: 'reporter',
  claimVerified: true,
};

const CALLER_REPORTER_B = {
  uid: UID.reporterB,
  email: 'reporter.b@siska.test',
  role: 'reporter',
  claimVerified: true,
};

function withCloudinaryEnv(fn) {
  return async () => {
    const prevEnv = {
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
      CLOUDINARY_UPLOAD_FOLDER: process.env.CLOUDINARY_UPLOAD_FOLDER,
    };
    const originalFetch = globalThis.fetch;

    process.env.STORAGE_PROVIDER = 'cloudinary';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-siska-cloud';
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'siska_test_cloudinary_secret';
    process.env.CLOUDINARY_UPLOAD_FOLDER = 'siska';

    try {
      await fn();
    } finally {
      globalThis.fetch = originalFetch;
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

// ── Tahap 1: Unit Test Adapter, Signature, & Transformasi URL ──────────────

test(
  'CLD-01 (Tahap 1): Konfigurasi Cloudinary, penandatanganan SHA-1, pemetaan resourceType (image vs raw PDF), dan URL EXIF-stripped + Blur bekerja akurat',
  withCloudinaryEnv(async () => {
    const cfg = resolveCloudinaryConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.cloudName, 'demo-siska-cloud');
    assert.equal(resolveActiveStorageProvider(), 'cloudinary');

    // Pemetaan JPG/PNG -> image, PDF -> raw (aman untuk Cloudinary Free Tier)
    const imgMap = toCloudinaryPublicId(
      'reports/rpt_1/evidence/ev_1.jpg',
      'image/jpeg',
    );
    assert.equal(imgMap.resourceType, 'image');
    assert.equal(imgMap.publicId, 'siska/reports/rpt_1/evidence/ev_1');
    assert.equal(imgMap.format, 'jpg');

    const pdfMap = toCloudinaryPublicId(
      'reports/rpt_1/evidence/ev_2.pdf',
      'application/pdf',
    );
    assert.equal(pdfMap.resourceType, 'raw');
    assert.equal(pdfMap.publicId, 'siska/reports/rpt_1/evidence/ev_2.pdf');

    // Signed Download URL memiliki TTL <= 300s, attachment=true (SEC-F07), previewUrl (fl_strip_profile), & blurredPreviewUrl (e_blur:1200)
    const signed = buildCloudinarySignedDownloadUrl({
      storagePath: 'reports/rpt_1/evidence/ev_1.jpg',
      contentType: 'image/jpeg',
      expiresInSeconds: 999,
    });
    assert.equal(signed.expiresInSeconds, 300);
    assert.match(signed.url, /api\.cloudinary\.com\/v1_1\/demo-siska-cloud\/image\/download/);
    assert.match(signed.url, /attachment=true/);
    assert.match(signed.previewUrl ?? '', /fl_strip_profile,f_auto,q_auto/);
    assert.match(signed.blurredPreviewUrl ?? '', /e_blur:1200,fl_strip_profile/);

    // Signature SHA-1 deterministik dan mengurutkan parameter secara alfabetis
    const sig1 = signCloudinaryParams({ b: '2', a: '1' }, 'secret');
    const sig2 = signCloudinaryParams({ a: '1', b: '2' }, 'secret');
    assert.equal(sig1, sig2);
    assert.equal(sig1.length, 40);
  }),
);

// ── Tahap 2: Bukti Laporan via Cloudinary & Compensating Rollback ──────────

test(
  'CLD-02 (Tahap 2): Unggah foto bukti laporan ke Cloudinary (type=private, overwrite=false), Signed Download URL, Anti-IDOR, dan Compensating Delete saat DB gagal (FILE-04)',
  withCloudinaryEnv(async () => {
    resetMockFirebaseAdmin();
    const ds = buildDataset();
    seedMockDocs(ds.docs, ds.files);

    const fetchCalls = [];
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), method: init?.method, body: init?.body });
      return new Response(
        JSON.stringify({
          public_id: 'siska/reports/seed_rpt_a1/evidence/ev_cld_photo_1',
          bytes: VALID_JPEG_BYTES.byteLength,
          format: 'jpg',
          secure_url: 'https://res.cloudinary.com/demo-siska-cloud/image/private/siska/reports/seed_rpt_a1/evidence/ev_cld_photo_1.jpg',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    // 1. Reporter A mengunggah foto JPEG ke laporan miliknya via Cloudinary
    const committed = await registerEvidenceUpload(
      CALLER_REPORTER_A,
      'seed_rpt_a1',
      {
        evidenceId: 'ev_cld_photo_1',
        fileName: 'foto-bukti.jpg',
        contentType: 'image/jpeg',
        sizeBytes: VALID_JPEG_BYTES.byteLength,
        contentBase64: Buffer.from(VALID_JPEG_BYTES).toString('base64'),
      },
      'req_cld_ev_1',
    );

    assert.equal(committed.status, 'committed');
    assert.equal(
      committed.storagePath,
      'reports/seed_rpt_a1/evidence/ev_cld_photo_1.jpg',
    );
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/image\/upload$/);

    // Pastikan dokumen Firestore menyimpan storagePath (bukan URL publik!)
    const storedEvDoc = getMockDoc(
      'reports/seed_rpt_a1/evidence/ev_cld_photo_1',
    );
    assert.ok(storedEvDoc);
    assert.equal(
      storedEvDoc.storagePath,
      'reports/seed_rpt_a1/evidence/ev_cld_photo_1.jpg',
    );

    // SEC-F05: Percobaan menimpa evidenceId yang sama harus ditolak 409 CONFLICT tanpa memanggil Cloudinary lagi
    await assert.rejects(
      () =>
        registerEvidenceUpload(
          CALLER_REPORTER_A,
          'seed_rpt_a1',
          {
            evidenceId: 'ev_cld_photo_1',
            fileName: 'foto-timpa.jpg',
            contentType: 'image/jpeg',
            sizeBytes: VALID_JPEG_BYTES.byteLength,
            contentBase64: Buffer.from(VALID_JPEG_BYTES).toString('base64'),
          },
          'req_cld_dup',
        ),
      (err) => err instanceof ApiError && err.code === 'CONFLICT' && err.status === 409,
    );
    assert.equal(fetchCalls.length, 1);

    // 2. Otorisasi unduhan bukti menghasilkan Signed URL Cloudinary + previewUrl + blurredPreviewUrl
    const downloadGrant = await authorizeEvidenceDownload(
      CALLER_REPORTER_A,
      'seed_rpt_a1',
      'ev_cld_photo_1',
      'req_cld_dl_1',
    );
    assert.equal(downloadGrant.expiresInSeconds, 300);
    assert.match(downloadGrant.url, /api\.cloudinary\.com\/v1_1\/demo-siska-cloud\/image\/download/);
    assert.ok(downloadGrant.previewUrl);
    assert.ok(downloadGrant.blurredPreviewUrl);

    // 3. Anti-IDOR (FILE-03): Reporter B ditolak dengan 404 seragam
    await assert.rejects(
      () =>
        authorizeEvidenceDownload(
          CALLER_REPORTER_B,
          'seed_rpt_a1',
          'ev_cld_photo_1',
          'req_cld_idor',
        ),
      (err) => err instanceof ApiError && err.status === 404,
    );

    // 4. FILE-04 Compensating Rollback: jika Firestore gagal commit, objek di Cloudinary otomatis dihapus (/destroy)
    setSimulateNextCommitFailure(true);
    await assert.rejects(
      () =>
        registerEvidenceUpload(
          CALLER_REPORTER_A,
          'seed_rpt_a1',
          {
            evidenceId: 'ev_cld_rollback',
            fileName: 'foto-rollback.jpg',
            contentType: 'image/jpeg',
            sizeBytes: VALID_JPEG_BYTES.byteLength,
            contentBase64: Buffer.from(VALID_JPEG_BYTES).toString('base64'),
          },
          'req_cld_rb',
        ),
      (err) => err instanceof ApiError && err.status === 500,
    );

    // Pastikan panggilan terakhir ke Cloudinary adalah endpoint /image/destroy
    assert.equal(fetchCalls.length, 3);
    assert.match(fetchCalls[1].url, /\/image\/upload$/);
    assert.match(fetchCalls[2].url, /\/image\/destroy$/);
  }),
);

// ── Tahap 3: Lampiran Foto pada Ruang Chat ─────────────────────────────────

test(
  'CLD-03 (Tahap 3): Pengiriman lampiran foto di ruang chat menyimpannya secara privat di Cloudinary dan hanya peserta sah yang dapat meminta Signed URL',
  withCloudinaryEnv(async () => {
    resetMockFirebaseAdmin();
    const ds = buildDataset();
    seedMockDocs(ds.docs, ds.files);

    const fetchCalls = [];
    globalThis.fetch = async (url) => {
      fetchCalls.push(String(url));
      return new Response(
        JSON.stringify({
          public_id: 'siska/conversations/conv_att/msg_1',
          bytes: VALID_PNG_BYTES.byteLength,
          format: 'png',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const { conversation } = await createOrOpenConversation(CALLER_REPORTER_A, {
      reportId: 'seed_rpt_a1',
    });

    // Reporter A mengirim pesan dengan lampiran foto PNG
    const msgWithPhoto = await sendMessage(
      CALLER_REPORTER_A,
      conversation.id,
      {
        body: 'Berikut tangkapan layar bukti percakapan tambahan.',
        attachment: {
          fileName: 'screenshot-chat.png',
          contentType: 'image/png',
          sizeBytes: VALID_PNG_BYTES.byteLength,
          bytes: VALID_PNG_BYTES,
        },
      },
    );

    assert.ok(msgWithPhoto.attachmentPath);
    assert.match(
      msgWithPhoto.attachmentPath,
      /^conversations\/.*\/attachments\/.*\.png$/,
    );
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0], /\/image\/upload$/);

    // Peserta sah (Reporter A & Admin 1) dapat mengambil Signed URL lampiran
    const attSigned = await authorizeMessageAttachmentDownload(
      CALLER_REPORTER_A,
      conversation.id,
      msgWithPhoto.id,
      'req_chat_att_ok',
    );
    assert.equal(attSigned.expiresInSeconds, 300);
    assert.ok(attSigned.previewUrl);
    assert.match(attSigned.previewUrl, /fl_strip_profile/);

    // Non-peserta (Reporter B) ditolak 404 NOT_FOUND (Anti-IDOR)
    await assert.rejects(
      () =>
        authorizeMessageAttachmentDownload(
          CALLER_REPORTER_B,
          conversation.id,
          msgWithPhoto.id,
          'req_chat_att_idor',
        ),
      (err) => err instanceof ApiError && err.status === 404,
    );
  }),
);

// ── Tahap 4: Foto Profil Pengguna & Gambar Sampul Materi Edukasi ───────────

test(
  'CLD-04 (Tahap 4): Unggah foto profil pengguna (avatar auto-crop) dan gambar sampul materi edukasi (beserta penghapusan otomatis saat materi dihapus)',
  withCloudinaryEnv(async () => {
    resetMockFirebaseAdmin();
    const ds = buildDataset();
    seedMockDocs(ds.docs, ds.files);

    const fetchCalls = [];
    globalThis.fetch = async (url) => {
      fetchCalls.push(String(url));
      return new Response(
        JSON.stringify({
          public_id: 'siska/asset',
          bytes: VALID_JPEG_BYTES.byteLength,
          format: 'jpg',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    // 1. Reporter A memperbarui profil sekaligus mengunggah foto avatar
    const updatedProfile = await updateMyProfile(
      CALLER_REPORTER_A,
      {
        displayName: 'Pelapor A Dengan Avatar',
        avatar: {
          fileName: 'profil.jpg',
          contentType: 'image/jpeg',
          sizeBytes: VALID_JPEG_BYTES.byteLength,
          bytes: VALID_JPEG_BYTES,
        },
      },
      'req_prof_avatar',
    );

    assert.equal(updatedProfile.displayName, 'Pelapor A Dengan Avatar');
    assert.ok(updatedProfile.photoUrl);
    assert.match(
      updatedProfile.photoUrl,
      /res\.cloudinary\.com\/demo-siska-cloud\/image\/upload\/c_fill,g_auto,w_256,h_256,fl_strip_profile,f_auto,q_auto/,
    );

    // 2. Admin 1 membuat materi edukasi dengan gambar sampul (coverImage)
    const createdEdu = await createEducationMaterial(
      CALLER_ADMIN_1,
      {
        title: 'Infografis Pencegahan Kekerasan Seksual',
        tag: 'Infografis',
        category: 'general',
        icon: 'shield',
        excerpt: 'Panduan visual pencegahan kekerasan di lingkungan kampus.',
        content: 'Isi lengkap materi edukasi beserta infografis pendukung.',
        coverImage: {
          fileName: 'poster-edukasi.png',
          contentType: 'image/png',
          sizeBytes: VALID_PNG_BYTES.byteLength,
          bytes: VALID_PNG_BYTES,
        },
      },
      'req_edu_cover',
    );

    assert.ok(createdEdu.coverImageUrl);
    assert.match(
      createdEdu.coverImageUrl,
      /res\.cloudinary\.com\/demo-siska-cloud\/image\/upload\/c_limit,w_1200,fl_strip_profile,f_auto,q_auto/,
    );

    // 3. Saat materi edukasi dihapus, gambar sampul di Cloudinary ikut dihapus (/image/destroy)
    await deleteEducationMaterial(CALLER_ADMIN_1, createdEdu.id, 'req_edu_del_cover');
    assert.match(fetchCalls[fetchCalls.length - 1], /\/image\/destroy$/);
  }),
);

// ── Tahap 5: Verifikasi CSP Headers pada next.config.ts ────────────────────

test('CLD-05 (Tahap 5): Content-Security-Policy pada next.config.ts mengizinkan domain Cloudinary (res.cloudinary.com & api.cloudinary.com)', () => {
  const nextConfigContent = readFileSync(
    resolvePath(process.cwd(), 'next.config.ts'),
    'utf8',
  );
  assert.match(nextConfigContent, /img-src[^;]*https:\/\/res\.cloudinary\.com/);
  assert.match(nextConfigContent, /connect-src[^;]*https:\/\/api\.cloudinary\.com/);
});
