import { useEffect, useState } from 'preact/hooks';
import { t } from '../lib/content.js';
import { Companion, StarRow, Btn } from '../components/Bits.jsx';
import { StarIcon } from '../components/Icons.jsx';
import { Confetti, StickerReward, reducedMotion } from '../components/Celebrate.jsx'; // T5
import { sfx } from '../lib/sound.js'; // T5

export function Results({ profile, summary, onAgain, onMap, onAlbum }) {
  const { rating, total, firstTry, starsEarned, levelUp, level, reviewAdded, stickers = [] } = summary;
  const msg = rating === 3 ? t('results.perfect') : rating === 2 ? t('results.good') : t('results.keepGoing');
  // T5: fanfare as the stars land, then any stickers earned peel off one by one.
  const [showStickers, setShowStickers] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => (rating >= 2 ? sfx.fanfare() : sfx.star()), reducedMotion() ? 0 : 320);
    const b = stickers.length ? setTimeout(() => setShowStickers(true), reducedMotion() ? 400 : 2100) : 0;
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  return (
    <div class="screen results">
      {rating === 3 && <Confetti />}
      <div class="results-card">
        <Companion id={profile.companion} size={170} mood="happy" />
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
      {showStickers && <StickerReward stickers={stickers} onClose={() => setShowStickers(false)} onAlbum={onAlbum} />}
    </div>
  );
}
