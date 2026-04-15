import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const nav = useNavigate();
  const [address, setAddress] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    nav(`/property?address=${encodeURIComponent(address.trim())}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-bold mb-2">MultiFamily Analyzer</h1>
        <p className="text-slate-400 mb-8">
          Denver-focused deal analysis. Enter an address to pull public data, underwrite, and
          generate an LOI.
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="1234 S Pearl St, Denver, CO"
            className="flex-1 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-400 text-slate-100"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold text-white"
          >
            Analyze
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-4">
          v0.1 · Phase 1 — address search scaffolding
        </p>
      </div>
    </div>
  );
}
