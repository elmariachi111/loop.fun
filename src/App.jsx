import './App.css'

function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="nav-section">
          <h3>FEED</h3>
          <ul>
            <li><a href="#">◉ hot</a></li>
            <li><a href="#">⬆ trending</a></li>
            <li><a href="#">★ favorites</a></li>
            <li><a href="#">⚡ fresh</a></li>
          </ul>
        </div>
        <div className="nav-section">
          <h3>UPLOAD</h3>
          <ul>
            <li><a href="#">⬆ new video</a></li>
            <li><a href="#">✏ edit draft</a></li>
            <li><a href="#">📊 analytics</a></li>
          </ul>
        </div>
        <div className="nav-section">
          <h3>SOCIAL</h3>
          <ul>
            <li><a href="#">👥 following</a></li>
            <li><a href="#">💬 messages</a></li>
            <li><a href="#">🔔 notifications</a></li>
          </ul>
        </div>
      </nav>

      <main className="main-content">
        <header className="header">
          <div className="logo-area">
            <h1 className="logo">loop.fun</h1>
            <div className="tagline">// where noobs become hackers</div>
          </div>
        </header>
        
        <div className="content-area">
          <div className="welcome-box">
            <h2>▶ WELCOME TO THE LOOP ◀</h2>
            <p>Upload. Watch. Repeat. Break the internet, one video at a time.</p>
            <div className="action-buttons">
              <button className="btn-primary">START UPLOADING</button>
              <button className="btn-secondary">BROWSE VIDEOS</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="future-text">
            <p>🌈 THE FUTURE IS BRIGHT 🌈</p>
            <p>Where unicorns code and rainbows compile</p>
            <div className="rainbow-bar"></div>
          </div>
          <div className="footer-links">
            <a href="#">terms</a> | <a href="#">privacy</a> | <a href="#">contact</a> | <a href="#">api</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
