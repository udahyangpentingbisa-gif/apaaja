import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY harus diisi bersama.');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  })
  : null;

export const cloudEnabled = supabase !== null;

function throwIfError(error) {
  if (error) throw new Error(error.message || 'Permintaan ke Supabase gagal.');
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  throwIfError(error);
  return data.session;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  throwIfError(error);
  return data.session;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  throwIfError(error);
}

export async function loadLedger() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await supabase
    .from('business_ledger')
    .select('data')
    .eq('id', 1)
    .maybeSingle();
  throwIfError(error);
  return data?.data ?? { employees: [], attendance: {}, loans: [] };
}

export async function saveLedger(ledger, userId) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const { error } = await supabase
    .from('business_ledger')
    .upsert({ id: 1, data: ledger, updated_by: userId }, { onConflict: 'id' });
  throwIfError(error);
}

export async function loadReports() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await supabase
    .from('bookkeeping_reports')
    .select('id, report_date, title, employee_count, total_loan_amount, total_repaid, total_outstanding, snapshot, created_at')
    .order('created_at', { ascending: false });
  throwIfError(error);
  return data;
}

export async function saveReport(report, userId) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await supabase
    .from('bookkeeping_reports')
    .insert({
      report_date: report.reportDate,
      title: report.title,
      employee_count: report.employeeCount,
      total_loan_amount: report.totalLoanAmount,
      total_repaid: report.totalRepaid,
      total_outstanding: report.totalOutstanding,
      snapshot: report.snapshot,
      created_by: userId
    })
    .select('id, report_date, title, employee_count, total_loan_amount, total_repaid, total_outstanding, snapshot, created_at')
    .single();
  throwIfError(error);
  return data;
}
