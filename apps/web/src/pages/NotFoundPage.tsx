import { Link } from 'react-router';

export function NotFoundPage() {
  return (
      <section className="landing-status">
        <div className="landing-status__card">
          <p className="eyebrow">404 · Off the trail</p>
          <h1 className="landing-status__title">Page not found</h1>
          <p className="landing-status__text">
            The trail you are following doesn't lead anywhere. The page might have been moved,
            deleted, or perhaps it never existed in this part of the mountain.
          </p>

          <div className="landing-status__actions">
            <Link to="/" className="button-primary button-primary--inline">
              <span>Back to home</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/book" className="pill">
              Book a table
            </Link>
          </div>
        </div>
      </section>
      );
}
