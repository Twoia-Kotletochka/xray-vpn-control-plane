export function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <p className="page-header__eyebrow">secure admin access</p>
          <h1>Sign in to server-vpn</h1>
          <p>
            The UI shell is ready. The next backend step wires real auth, refresh sessions, and
            brute-force protection.
          </p>
        </div>

        <form className="login-form">
          <label>
            <span>Username</span>
            <input placeholder="admin" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" placeholder="••••••••••••" />
          </label>
          <button className="button button--primary" type="button">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
