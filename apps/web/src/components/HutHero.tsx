export function HutHero() {
  return (
    <section className="hero">
      <div className="hero__text">
        <p className="hero__altitude">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 20 10 7l4 6 2-3 5 10H3Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          Hospitality at 1,500 m
        </p>
        <h1 className="hero__name">Selvapiana Mountain Hut</h1>
        <p className="hero__place">Val di Funes, Dolomiti</p>
      </div>
    </section>
  );
}