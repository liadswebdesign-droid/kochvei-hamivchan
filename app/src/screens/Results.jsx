import { t } from '../lib/content.js';
import { Companion, StarRow, Btn } from '../components/Bits.jsx';
import { StarIcon } from '../components/Icons.jsx';

export function Results({ profile, summary, onAgain, onMap }) {
  const { rating, total, firstTry, starsEarned, levelUp, level, reviewAdded } = summary;
  const msg = rating === 3 ? t('results.perfect') : rating === 2 ? t('results.good') : t('results.keepGoing');
  return (
    <div class="screen results">
      <div class="confetti calm" aria-hidden="true">
        {rating === 3 && Array.from({ length: 22 }, (_, i) => <span style={{ '--i': i }} />)}
      </div>
      <div class="results-card">
        <Companion id={profile.companion} size={140} mood="happy" />
        <h1 class="title">{t('results.title')}</h1>
        <div class="results-stars">
          <StarRow n={rating} size={84} />
        </div>
        <p class="results-msg">{msg}</p>
        <p class="results-score">{t('results.score', { n: firstTry, total })}</p>
        <p class="results-earned">
          <StarIcon size={30} /> <span>+{starsEarned}</span>
        </p>
        {levelUp && <p class="results-level">{t('results.levelUp', { n: level })}</p>}
        {reviewAdded > 0 && <p class="results-review">{t('results.reviewAdded', { n: reviewAdded })}</p>}
        <div class="row-btns">
          <Btn kind="ghost" onClick={onMap}>{t('results.toMap')}</Btn>
          <Btn kind="primary" onClick={onAgain}>{t('results.again')}</Btn>
        </div>
      </div>
    </div>
  );
}
