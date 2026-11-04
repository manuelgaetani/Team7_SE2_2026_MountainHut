import { Link } from 'react-router';
import { useCurrentUser } from '../api/useAuth.ts';

export function HomePage() {
  

  const { data: user, isPending } = useCurrentUser();
  const mountainImage = `${import.meta.env.BASE_URL}Monte-Vettore2.webp`;
  const hubImage = `${import.meta.env.BASE_URL}rifugio-ana-giovanni.jpg`;

  return (
    <main>
      <section className="home-hero">
        <img className="home-hero__image" src={mountainImage} alt="Monte Vettore" />

        <div className="home-hero__overlay" />

        <div className="home-hero__content">
          <p className="eyebrow">Mountain hut · Monte Vettore</p>

          <h1>Closer to the sky.</h1>

          <p className="lead">
            A simple place to rest, eat and set off again. Plan your stop with confidence.
          </p>

          {!isPending && !user && (
            <Link to="/register" className="button-primary button-primary--inline">
              <span>Register to book a table</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </section>

      <section className="home-about">
        <div className="home-section home-about__grid">
          <img className="home-about__image" src={hubImage} alt="View of Monte Vettore" />

          <div className="home-about__content">
            <p className="eyebrow eyebrow--dark">Our mountain hut</p>

            <h2>A home among the mountains.</h2>

            <p>
              Our mountain hut is a simple and welcoming place where hikers can rest, enjoy local
              food and prepare for their next trail.
            </p>
          </div>
        </div>
      </section>

      <section className="home-info">
        <div className="home-section">
          <h2>Essential information</h2>

          <div className="home-info__grid">
            <article className="home-info__item">
              <strong>2,476 m</strong>
              <span>Altitude</span>
            </article>

            <article className="home-info__item">
              <strong>24</strong>
              <span>Beds available</span>
            </article>

            <article className="home-info__item">
              <strong>June – September</strong>
              <span>Opening period</span>
            </article>
          </div>

          <p className="home-info__description">
            Always check the weather and trail conditions before starting your journey to the
            mountain hut.
          </p>
        </div>
      </section>
    </main>
  );
}
