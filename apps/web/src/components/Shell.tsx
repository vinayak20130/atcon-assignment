'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type SessionUser, clearSession, getToken, getUser } from '@/lib/api';

const NAV = [
  { href: '/jobs', label: 'Requisitions' },
  { href: '/insights', label: 'Insights' },
];

// Redirects to login when there is no token rather than rendering an empty
// dashboard — a screen full of em-dashes is worse than being told to sign in.
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
  }, [router]);

  if (!user) return null;

  return (
    <>
      <header className="topbar">
        <Link href="/jobs" className="wordmark">
          North<span>wind</span>
        </Link>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} data-active={pathname.startsWith(item.href) || undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="whoami">
          <span>
            {user.fullName} · <span className="mono">{user.role.toLowerCase()}</span>
          </span>
          <button
            className="btn btn-sm"
            onClick={() => {
              clearSession();
              router.push('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
