'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { send } from '@/lib/client';
import { useLedger } from '../Providers';

export default function StaffPage() {
  const { me, setMe } = useLedger();
  const router = useRouter();
  const [login, setLogin] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState('');

  async function doLogin() {
    const { ok, j } = await send('/api/auth/login', login);
    if (!ok) return setMsg(j.error || 'Login failed.');
    setMsg('');
    setLogin({ email: '', password: '' });
    const r = await send('/api/auth/me', undefined, 'GET');
    setMe(r.j.user ?? null);
    router.push('/');
  }

  return (
    <div className="wrap page narrow">
      <p className="kicker">Staff</p>
      <h1 className="page-title">Staff login</h1>
      {me ? (
        <p className="note">Logged in as {me.name} ({me.role.toLowerCase()}). Use the menu to log out.</p>
      ) : (
        <div className="panel">
          <p className="note">For coordinators and admins. Donors do not need an account.</p>
          <label htmlFor="staff-email">Email</label>
          <input id="staff-email" type="email" autoComplete="username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
          <label htmlFor="staff-pass">Password</label>
          <input
            id="staff-pass"
            type="password"
            autoComplete="current-password"
            value={login.password}
            onChange={(e) => setLogin({ ...login, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          <button onClick={doLogin}>Log in</button>
          {msg && <p className="err" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}
