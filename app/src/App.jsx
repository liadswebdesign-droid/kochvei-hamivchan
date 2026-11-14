import { useEffect, useState } from 'preact/hooks';
import { loadCore, t } from './lib/content.js';
import { getProfiles, getActiveId, setActiveId } from './lib/storage.js';
import { setSafeToReload } from './lib/swUpdate.js';
import { ProfileCreate, ProfileSwitcher } from './screens/Profiles.jsx';
import { MapScreen } from './screens/MapScreen.jsx';
import { Practice } from './screens/Practice.jsx';
import { Results } from './screens/Results.jsx';
import { MockStart } from './screens/MockStart.jsx';
import { MockExam } from './screens/MockExam.jsx';
import { MockResults } from './screens/MockResults.jsx';
import { Parent } from './screens/Parent.jsx';
// T5: sticker album + mini-games
import { Album } from './screens/Album.jsx';
import { GamesHub, GameScreen } from './screens/Games.jsx';

export function App() {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [profiles, setProfiles] = useState(getProfiles());
  const [activeId, setActive] = useState(getActiveId());
  const [screen, setScreen] = useState({ name: 'map' });

  useEffect(() => {
    loadCore().then(setContent, (e) => setError(String(e)));
  }, []);

  const profile = profiles.find((p) => p.id === activeId);
  // A new build (service-worker update) is reloaded only from the map or the load-error screen, never mid-question.
  const safeToReload = !!error || (!!content && !!profile && screen.name === 'map');
  useEffect(() => setSafeToReload(safeToReload), [safeToReload]);

  const refresh = () => {
    setProfiles(getProfiles());
    setActive(getActiveId());
  };

  if (error) return <div class="screen center"><p class="bigmsg">{t('app.loadError')}</p></div>;
  if (!content) return <div class="screen center"><div class="loader" aria-busy="true" /></div>;

  const preview = content.manifest.source !== 'content-build';
  let body;
  if (!profiles.length || screen.name === 'create') {
    body = (
      <ProfileCreate
        canCancel={profiles.length > 0}
        onCancel={() => setScreen({ name: 'profiles' })}
        onDone={() => {
          refresh();
          setScreen({ name: 'map' });
        }}
      />
    );
  } else if (!profile || screen.name === 'profiles') {
    body = (
      <ProfileSwitcher
        profiles={profiles}
        activeId={activeId}
        onPick={(id) => {
          setActiveId(id);
          refresh();
          setScreen({ name: 'map' });
        }}
        onAdd={() => setScreen({ name: 'create' })}
      />
    );
  } else if (screen.name === 'parent') {
    body = <Parent profiles={profiles} activeId={activeId} content={content} onChanged={refresh} onClose={() => setScreen({ name: 'map' })} />;
  } else if (screen.name === 'mockStart') {
    body = (
      <MockStart
        profile={profile}
        onBack={() => setScreen({ name: 'map' })}
        onStart={(simId, mode, resume) => setScreen({ name: 'mock', simId, mode, resume, run: Date.now() })}
      />
    );
  } else if (screen.name === 'mock') {
    body = (
      <MockExam
        key={screen.run}
        profile={profile}
        content={content}
        simId={screen.simId}
        mode={screen.mode}
        resume={screen.resume}
        onQuit={() => setScreen({ name: 'mockStart' })}
        onFinish={(result) => setScreen({ name: 'mockResults', result })}
      />
    );
  } else if (screen.name === 'mockResults') {
    body = (
      <MockResults
        profile={profile}
        result={screen.result}
        onDone={() => setScreen({ name: 'map' })}
        onMore={() => setScreen({ name: 'mockStart' })}
        onAlbum={() => setScreen({ name: 'album' })}
      />
    );
  } else if (screen.name === 'practice') {
    body = (
      <Practice
        key={screen.run}
        profile={profile}
        skill={screen.skill}
        content={content}
        onQuit={() => setScreen({ name: 'map' })}
        onFinish={(summary) => setScreen({ name: 'results', summary, skill: screen.skill })}
      />
    );
  } else if (screen.name === 'results') {
    body = (
      <Results
        profile={profile}
        summary={screen.summary}
        onAgain={() => setScreen({ name: 'practice', skill: screen.skill, run: Date.now() })}
        onMap={() => setScreen({ name: 'map' })}
        onAlbum={() => setScreen({ name: 'album' })}
      />
    );
  } else if (screen.name === 'album') {
    body = <Album profile={profile} onBack={() => setScreen({ name: 'map' })} />;
  } else if (screen.name === 'games') {
    body = <GamesHub profile={profile} onBack={() => setScreen({ name: 'map' })} onPick={(id) => setScreen({ name: 'game', id })} />;
  } else if (screen.name === 'game') {
    body = <GameScreen key={screen.id} id={screen.id} profile={profile} content={content} onExit={() => setScreen({ name: 'games' })} onAlbum={() => setScreen({ name: 'album' })} />;
  } else {
    body = (
      <MapScreen
        profile={profile}
        content={content}
        onIsland={(skill) => setScreen(skill === 'mock' ? { name: 'mockStart' } : { name: 'practice', skill, run: Date.now() })}
        onSwitch={() => setScreen({ name: 'profiles' })}
        onParent={() => setScreen({ name: 'parent' })}
        onAlbum={() => setScreen({ name: 'album' })}
        onGames={() => setScreen({ name: 'games' })}
      />
    );
  }
  return (
    <>
      {preview && <div class="preview-banner">{t('app.previewBanner')}</div>}
      {body}
    </>
  );
}
