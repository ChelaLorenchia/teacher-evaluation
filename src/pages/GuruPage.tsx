import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { PaketTugas } from '../types';
import { validatePaketGuru } from '../lib/paket';
import { parseFeedbackFile } from '../lib/feedback';
import { hash } from '../lib/blind';
import { unduhBerkasCadangan, pulihkanCadanganData } from '../lib/backup';
import { AnotasiGuruPage } from './AnotasiGuruPage';
import { EvaluasiGuruPage } from './EvaluasiGuruPage';
import { FeedbackRow } from '../lib/feedback';
import { RubrikRow, SkorJawaban } from '../types';
import { readDriveApiResponse } from '../lib/driveApi';

type GuruMode = 'anotasi' | 'evaluasi';

const LS_MODE = 'qb_guru_mode_v1';
const LS_ANNOTATION_TEMPLATE = 'qb_guru_anotasi_template_v1';
const LS_ANNOTATION_ROWS = 'qb_guru_anotasi_rows_v1';
const LS_ANNOTATION_RUBRIK = 'qb_guru_anotasi_rubrik_v1';
const LS_ANNOTATION_SKOR = 'qb_guru_anotasi_skor_v1';
const LS_ANNOTATION_WARNINGS = 'qb_guru_anotasi_warnings_v1';
const LS_EVALUATION_PACKAGE = 'qb_guru_eval_paket_v1';
const LS_EVALUATION_DATA = 'qb_guru_eval_data_v1';
const LS_ANNOTATION_EXPORT = 'qb_guru_anotasi_export_snapshot_v1';
const LS_EVALUATION_EXPORT = 'qb_guru_eval_export_snapshot_v1';

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch (error) {
    console.error(`Gagal membaca ${key}:`, error);
    return fallback;
  }
}

function currentMode(): GuruMode | null {
  const mode = localStorage.getItem(LS_MODE);
  return mode === 'anotasi' || mode === 'evaluasi' ? mode : null;
}

function modeHasUnexportedChanges(mode: GuruMode | null): boolean {
  if (mode === 'anotasi') {
    const rows = readStoredJson<FeedbackRow[]>(LS_ANNOTATION_ROWS, []);
    const skor = readStoredJson<Record<string, SkorJawaban>>(LS_ANNOTATION_SKOR, {});
    const rubrik = readStoredJson<RubrikRow[]>(LS_ANNOTATION_RUBRIK, []);
    const hasRatings = rows.some(row => row.status === 'Yes' || row.status === 'No') ||
      Object.keys(skor).length > 0;
    return hasRatings && JSON.stringify({ rows, skor, rubrik }) !== localStorage.getItem(LS_ANNOTATION_EXPORT);
  }
  if (mode === 'evaluasi') {
    const data = readStoredJson<{
      hasil?: Record<string, unknown>;
      draf?: Record<string, { kotor?: boolean }>;
    }>(LS_EVALUATION_DATA, {});
    const results = data.hasil ?? {};
    const dirtyDraft = Object.values(data.draf ?? {}).some(draft => draft.kotor);
    return dirtyDraft ||
      (Object.keys(results).length > 0 && JSON.stringify(results) !== localStorage.getItem(LS_EVALUATION_EXPORT));
  }
  return false;
}

function modeHasData(mode: GuruMode | null): boolean {
  if (mode === 'anotasi') return Boolean(localStorage.getItem(LS_ANNOTATION_TEMPLATE));
  if (mode === 'evaluasi') return Boolean(localStorage.getItem(LS_EVALUATION_PACKAGE));
  return false;
}

function getStoredPackage(mode: GuruMode | null): PaketTugas | null {
  if (mode !== 'evaluasi') return null;
  const saved = localStorage.getItem(LS_EVALUATION_PACKAGE);
  if (!saved) return null;
  const result = validatePaketGuru(saved);
  if (!result.sukses || !result.paket) {
    console.error('Paket evaluasi yang tersimpan tidak valid:', result.pesan);
    return null;
  }
  return result.paket;
}

export const GuruPage: React.FC = () => {
  const [mode, setMode] = useState<GuruMode | null>(() => currentMode());
  const [paket, setPaket] = useState<PaketTugas | null>(() => getStoredPackage(currentMode()));
  const [warningMessages, setWarningMessages] = useState<string[]>(() =>
    readStoredJson(LS_ANNOTATION_WARNINGS, [])
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [loadedFileKey, setLoadedFileKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [week, setWeek] = useState('WEEK 1');
  const [questionFiles, setQuestionFiles] = useState<Array<{
    id: string;
    name: string;
    size?: string;
    createdTime?: string;
  }>>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [driveFilesError, setDriveFilesError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminFiles, setAdminFiles] = useState<Array<{
    id: string;
    name: string;
    size?: string;
    createdTime?: string;
  }>>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [uploadTargetFileId, setUploadTargetFileId] = useState<string | null>(null);
  const [refreshDriveFiles, setRefreshDriveFiles] = useState(0);
  const [driveHealth, setDriveHealth] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDriveFilesLoading(true);
    setDriveFilesError(null);
    fetch(`/api/list-drive?week=${encodeURIComponent(week)}&documentKind=question`)
      .then(async response => {
        const result = await readDriveApiResponse(response);
        if (active) setQuestionFiles(result.files ?? []);
      })
      .catch(caught => {
        if (active) setDriveFilesError(caught instanceof Error ? caught.message : 'Google Drive tidak tersedia.');
      })
      .finally(() => {
        if (active) setDriveFilesLoading(false);
      });
    return () => { active = false; };
  }, [week, refreshDriveFiles]);

  const refreshAdminFiles = async () => {
    if (!adminToken.trim()) {
      setAdminError('Masukkan token Admin terlebih dahulu.');
      return;
    }
      setAdminBusy(true);
      setAdminError(null);
      try {
        const response = await fetch(`/api/list-drive?week=${encodeURIComponent(week)}&documentKind=answer`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const result = await readDriveApiResponse(response);
        setAdminFiles(result.files ?? []);
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Gagal memuat jawaban guru.');
      } finally {
        setAdminBusy(false);
      }
  };

  const checkDriveHealth = async () => {
    setDriveHealth('Memeriksa koneksi Google Drive...');
    try {
      const response = await fetch('/api/health-drive');
      const result = await readDriveApiResponse(response);
      setDriveHealth(result.drive?.connected
        ? `API aktif dan Google Drive terhubung: ${result.rootFolder?.name ?? 'folder root terverifikasi'}.`
        : `API aktif, tetapi Google Drive belum terhubung: ${result.drive?.message ?? 'periksa konfigurasi backend.'}`);
    } catch (caught) {
      setDriveHealth(caught instanceof Error ? caught.message : 'Pemeriksaan koneksi gagal.');
    }
  };

  const downloadDriveFile = async (
      file: { id: string; name: string },
      documentKind: 'question' | 'answer',
  ) => {
      setAdminError(null);
      try {
        const params = new URLSearchParams({
          fileId: file.id,
          week,
          documentKind,
        });
        const response = await fetch(`/api/download-drive?${params}`, {
          headers: documentKind === 'answer' ? { Authorization: `Bearer ${adminToken}` } : undefined,
        });
        if (!response.ok) {
          const contentType = response.headers.get('content-type') ?? '';
          const body = contentType.includes('application/json') ? await response.json() : null;
          throw new Error(body?.message || 'Unduhan gagal.');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Unduhan gagal.');
      }
  };

  const uploadQuestionFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setAdminBusy(true);
      setAdminError(null);
      try {
        if (!/\.xlsx$/i.test(file.name) || file.size > 3 * 1024 * 1024) {
          throw new Error('Pilih file .xlsx dengan ukuran maksimal 3 MB.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const response = await fetch('/api/upload-drive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            fileName: file.name,
            fileBase64: btoa(binary),
            week,
            documentKind: 'question',
            ...(uploadTargetFileId ? { fileId: uploadTargetFileId } : {}),
          }),
        });
        await readDriveApiResponse(response);
        setUploadTargetFileId(null);
        setRefreshDriveFiles(value => value + 1);
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Upload file gagal.');
      } finally {
        setAdminBusy(false);
      }
  };

  const deleteDriveFile = async (
      file: { id: string; name: string },
      documentKind: 'question' | 'answer',
  ) => {
      if (!window.confirm(`Pindahkan "${file.name}" ke sampah Google Drive?`)) return;
      setAdminBusy(true);
      setAdminError(null);
      try {
        const params = new URLSearchParams({ fileId: file.id, week, documentKind });
        const response = await fetch(`/api/delete-drive?${params}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        await readDriveApiResponse(response);
        setRefreshDriveFiles(value => value + 1);
        if (documentKind === 'answer') setAdminFiles(current => current.filter(item => item.id !== file.id));
      } catch (caught) {
        setAdminError(caught instanceof Error ? caught.message : 'Penghapusan file gagal.');
      } finally {
        setAdminBusy(false);
      }
  };

  useEffect(() => {
    if (!window.location.hash) window.location.hash = '#/guru';
  }, []);

  const handleLoadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setFileError(null);
    setFileSuccess(null);
    setFileWarning(null);
    const extension = file.name.split('.').pop()?.toLowerCase();
    const targetMode: GuruMode | null =
      extension === 'json' ? 'evaluasi' :
      extension === 'xlsx' || extension === 'csv' ? 'anotasi' : null;
    if (!targetMode) {
      setFileError('Format file tidak didukung. Pilih template anotasi .xlsx/.csv atau paket evaluasi .json.');
      return;
    }

    const previousMode = currentMode();
    if (
      previousMode &&
      previousMode !== targetMode &&
      modeHasData(previousMode) &&
      !window.confirm(
        modeHasUnexportedChanges(previousMode)
          ? 'Ada penilaian mode aktif yang belum diekspor. Ekspor hasil atau cadangkan data terlebih dahulu. Data kedua mode tetap disimpan terpisah. Tetap lanjut?'
          : 'Anda akan berpindah jenis tugas. Data setiap mode disimpan terpisah; ekspor atau cadangkan data sebelum melanjutkan. Tetap lanjut?'
      )
    ) {
      return;
    }

    if (targetMode === 'evaluasi') {
      try {
        const result = validatePaketGuru(await file.text());
        if (!result.sukses || !result.paket) {
          setFileError(result.pesan || 'Paket evaluasi tidak valid.');
          return;
        }
        const previousPackage = localStorage.getItem(LS_EVALUATION_PACKAGE);
        const newPackage = JSON.stringify(result.paket);
        if (
          previousPackage &&
          previousPackage !== newPackage &&
          !window.confirm('Paket evaluasi berbeda dari file tersimpan. Data mode evaluasi sebelumnya akan diganti. Ekspor hasil atau cadangkan data terlebih dahulu. Lanjutkan?')
        ) {
          return;
        }
        if (previousPackage !== newPackage) {
          localStorage.removeItem(LS_EVALUATION_DATA);
          localStorage.removeItem(LS_EVALUATION_EXPORT);
        }
        localStorage.setItem(LS_EVALUATION_PACKAGE, newPackage);
        localStorage.setItem(LS_MODE, 'evaluasi');
        setPaket(result.paket);
        setMode('evaluasi');
        setWarningMessages([]);
        setLoadedFileKey(key => key + 1);
        setFileSuccess(`Paket ${result.paket.set} berhasil dimuat (${result.paket.tugas.length} tugas).`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Format file tidak dapat dibaca.';
        setFileError(`Gagal membaca paket evaluasi: ${reason}`);
      }
      return;
    }

    const result = await parseFeedbackFile(file);
    if (result.error || !result.rows) {
      setFileError(result.error || 'Template Feedback tidak valid.');
      return;
    }
    const existingTemplate = localStorage.getItem(LS_ANNOTATION_TEMPLATE);
    const templateIdentity = `${file.name}:${hash(JSON.stringify(result.rows.map(row => [
      row.id, row.kelas, row.pertanyaan, row.context, row.jawaban,
    ])), 'feedback-template-')}`;
    const storedRubrik = localStorage.getItem(LS_ANNOTATION_RUBRIK);
    const nextRubrik = result.rubrik ?? [];
    const rubrikChanged = storedRubrik !== null &&
      JSON.stringify(readStoredJson<RubrikRow[]>(LS_ANNOTATION_RUBRIK, nextRubrik)) !== JSON.stringify(nextRubrik);
    const existingSkor = readStoredJson<Record<string, SkorJawaban>>(LS_ANNOTATION_SKOR, {});
    const nextSkor = result.skor ?? {};
    const skorChanged = JSON.stringify(existingSkor) !== JSON.stringify(nextSkor);
    const existingRows = readStoredJson<FeedbackRow[]>(LS_ANNOTATION_ROWS, []);
    const existingHasRatings = existingRows.some(row => row.status === 'Yes' || row.status === 'No') ||
      Object.keys(existingSkor).length > 0;
    if (
      existingTemplate &&
      (existingTemplate !== templateIdentity || rubrikChanged || skorChanged) &&
      (!window.confirm(
        existingHasRatings
          ? 'Template anotasi berbeda dan ada penilaian tersimpan. Ekspor hasil atau cadangkan data terlebih dahulu. Ganti template dan penilaian mode anotasi?'
          : 'Template anotasi berbeda dari file tersimpan. Ganti template mode anotasi?'
      ))
    ) {
      return;
    }

    localStorage.setItem(LS_ANNOTATION_TEMPLATE, templateIdentity);
    const rowsToUse = existingTemplate === templateIdentity && !rubrikChanged ? existingRows : result.rows;
    localStorage.setItem(LS_ANNOTATION_ROWS, JSON.stringify(rowsToUse));
    localStorage.setItem(LS_ANNOTATION_RUBRIK, JSON.stringify(nextRubrik));
    localStorage.setItem(LS_ANNOTATION_SKOR, JSON.stringify(nextSkor));
    localStorage.setItem(LS_ANNOTATION_WARNINGS, JSON.stringify(result.warnings));
    if (existingTemplate !== templateIdentity || rubrikChanged || skorChanged) {
      localStorage.removeItem(LS_ANNOTATION_EXPORT);
    }
    localStorage.setItem(LS_MODE, 'anotasi');
    setMode('anotasi');
    setPaket(null);
    setWarningMessages(result.warnings);
    setLoadedFileKey(key => key + 1);
    const parseWarnings = [result.rubrikWarning, result.skorWarning].filter(Boolean);
    setFileWarning(parseWarnings.length ? parseWarnings.join(' ') : null);
    setFileSuccess(`Template Feedback berhasil dimuat (${result.groups?.length ?? 0} ID).`);
  };

  const handleBackup = () => {
    try {
      unduhBerkasCadangan();
      setFileSuccess('Cadangan data Guru berhasil diunduh.');
      setFileError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Terjadi kesalahan.';
      setFileError(`Gagal membuat cadangan: ${reason}`);
    }
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      const result = pulihkanCadanganData(String(loadEvent.target?.result ?? ''));
      if (!result.sukses) {
        setFileError(result.pesan);
        return;
      }
      window.location.reload();
    };
    reader.onerror = () => setFileError('Gagal membaca file cadangan.');
    reader.readAsText(file);
  };

  const modeLabel = mode === 'anotasi'
    ? 'Mode: Anotasi (Yes/No)'
    : mode === 'evaluasi'
    ? 'Mode: Evaluasi (A/B, 5 kriteria)'
    : 'Mode belum dipilih';

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      <section className="p-5 rounded-card bg-white border border-bd shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tx">Evaluation Documents / Question Bank</h2>
            <p className="mt-1 text-sm text-mute">
              Belum memiliki instrumen pertanyaan sendiri? Gunakan template evaluasi yang telah disediakan oleh Admin.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-bold text-tx">
              Periode
              <select
                value={week}
                onChange={event => setWeek(event.target.value)}
                className="block mt-1 min-h-[44px] px-3 rounded-btn border border-bdi bg-white"
              >
                {['WEEK 1', 'WEEK 2', 'WEEK 3', 'WEEK 4'].map(value =>
                  <option key={value} value={value}>{value}</option>
                )}
              </select>
            </label>
            <button type="button" onClick={checkDriveHealth} className="min-h-[44px] px-3 rounded-btn border border-bdi text-sm font-bold">
              Tes koneksi Drive
            </button>
          </div>
        </div>
        {driveHealth && <p role="status" className="mt-3 text-sm text-mute">{driveHealth}</p>}
        {driveFilesLoading ? (
          <p className="mt-4 text-sm text-mute">Memuat instrumen evaluasi...</p>
        ) : driveFilesError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">{driveFilesError}</p>
        ) : questionFiles.length === 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            Belum ada instrumen evaluasi yang diunggah oleh Admin untuk periode ini.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead><tr className="border-b border-bd"><th className="py-2">Nama File</th><th>Ukuran</th><th>Tanggal Upload</th><th>Aksi</th></tr></thead>
              <tbody>
                {questionFiles.map(file =>
                  <tr key={file.id} className="border-b border-bd/60">
                    <td className="py-3 font-semibold">{file.name}</td>
                    <td>{file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '-'}</td>
                    <td>{file.createdTime ? new Date(file.createdTime).toLocaleDateString('id-ID') : '-'}</td>
                    <td>
                      <button type="button" className="inline-flex min-h-[44px] items-center font-bold text-pri" onClick={() => downloadDriveFile(file, 'question')}>Download Excel</button>
                      {adminMode && <button type="button" className="ml-3 text-sm font-bold text-pri" onClick={() => setUploadTargetFileId(file.id)}>Perbarui</button>}
                      {adminMode && <button type="button" className="ml-3 text-sm font-bold text-danger" onClick={() => deleteDriveFile(file, 'question')}>Hapus</button>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <details className="mt-5 border-t border-bd pt-4">
          <summary className="min-h-[44px] cursor-pointer flex items-center font-bold text-pri">Pengelolaan Admin</summary>
          {!adminMode ? (
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <label className="text-sm font-semibold">
                Token Admin
                <input
                  type="password"
                  autoComplete="current-password"
                  value={adminToken}
                  onChange={event => setAdminToken(event.target.value)}
                  className="block mt-1 min-h-[44px] px-3 rounded-btn border border-bdi"
                  placeholder="Token dari pengelola"
                />
              </label>
              <button type="button" disabled={adminBusy || !adminToken.trim()} onClick={() => {
                setAdminMode(true);
                void refreshAdminFiles();
              }} className="min-h-[44px] px-4 rounded-btn bg-pri text-white font-bold disabled:opacity-50">
                Masuk Admin
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => {
                  document.getElementById('drive-question-upload')?.click();
                }} disabled={adminBusy} className="min-h-[44px] px-4 rounded-btn bg-pri text-white font-bold disabled:opacity-50">
                  {uploadTargetFileId ? 'Pilih file pengganti' : 'Upload soal Excel'}
                </button>
                <input id="drive-question-upload" type="file" accept=".xlsx" className="hidden" onChange={uploadQuestionFile} />
                {uploadTargetFileId && <button type="button" className="min-h-[44px] px-3 rounded-btn border border-bdi" onClick={() => setUploadTargetFileId(null)}>Batal pembaruan</button>}
                <button type="button" onClick={() => void refreshAdminFiles()} disabled={adminBusy} className="min-h-[44px] px-3 rounded-btn border border-bdi font-semibold disabled:opacity-50">
                  Muat jawaban guru
                </button>
                <button type="button" onClick={() => {
                  setAdminMode(false);
                  setAdminToken('');
                  setAdminFiles([]);
                  setAdminError(null);
                }} className="min-h-[44px] px-3 rounded-btn border border-bdi font-semibold">
                  Keluar Admin
                </button>
              </div>
              <p className="text-xs text-mute">Token hanya disimpan sementara di halaman ini. Gunakan koneksi HTTPS.</p>
              {adminBusy && <p role="status" className="text-sm text-mute">Memproses permintaan...</p>}
              {adminError && <p role="alert" className="text-sm font-semibold text-danger">{adminError}</p>}
              {adminFiles.length > 0 && (
                <div className="overflow-x-auto">
                  <h3 className="font-bold mb-2">Jawaban Guru — {week}</h3>
                  <table className="w-full text-sm text-left">
                    <thead><tr className="border-b border-bd"><th className="py-2">Nama File</th><th>Ukuran</th><th>Tanggal Upload</th><th>Aksi</th></tr></thead>
                    <tbody>{adminFiles.map(file => <tr key={file.id} className="border-b border-bd/60">
                      <td className="py-3 font-semibold">{file.name}</td>
                      <td>{file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '-'}</td>
                      <td>{file.createdTime ? new Date(file.createdTime).toLocaleDateString('id-ID') : '-'}</td>
                      <td>
                        <button type="button" className="min-h-[44px] font-bold text-pri" onClick={() => downloadDriveFile(file, 'answer')}>Download</button>
                        <button type="button" className="ml-3 min-h-[44px] font-bold text-danger" onClick={() => deleteDriveFile(file, 'answer')}>Hapus</button>
                      </td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </details>
      </section>
      <section className="p-5 rounded-card bg-white border border-bd shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-sm font-bold text-pri">{modeLabel}</strong>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 min-h-[44px] rounded-btn border border-pri text-pri font-bold text-xs flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Muat tugas
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.json"
              className="hidden"
              onChange={handleLoadFile}
            />
            <button
              type="button"
              onClick={handleBackup}
              className="px-3 py-2 min-h-[44px] rounded-btn border border-bdi text-tx font-semibold text-xs flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Cadangkan data (.json)
            </button>
            <label className="px-3 py-2 min-h-[44px] rounded-btn border border-bdi bg-white text-tx font-semibold text-xs flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4 text-mute" />
              Pulihkan cadangan
              <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
            </label>
          </div>
        </div>
        <p className="text-xs text-mute mt-2">
          .xlsx/.csv memuat template anotasi; .json memuat paket evaluasi validasi atau final test.
        </p>
        <div className="mt-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span><strong>Data tersimpan di browser ini.</strong> Ekspor .xlsx dan cadangkan .json secara berkala. Jangan hapus data browser sebelum mengekspor.</span>
        </div>
        {fileError && <p role="alert" className="mt-3 text-xs font-semibold text-danger">{fileError}</p>}
        {fileSuccess && <p role="status" className="mt-3 text-xs font-semibold text-pri">{fileSuccess}</p>}
        {fileWarning && (
          <p role="status" className="mt-3 p-3 rounded-card bg-amber-50 border border-amber-300 text-amber-900 text-xs">
            {fileWarning}
          </p>
        )}
      </section>

      {mode === 'anotasi' ? (
        <AnotasiGuruPage key={loadedFileKey} warningMessages={warningMessages} />
      ) : mode === 'evaluasi' && paket ? (
        <EvaluasiGuruPage key={JSON.stringify(paket)} paket={paket} />
      ) : (
        <div className="p-8 text-center text-mute bg-white rounded-card border border-bd">
          Belum ada tugas. Muat file template anotasi (.xlsx) atau paket evaluasi (.json).
        </div>
      )}
    </div>
  );
};
