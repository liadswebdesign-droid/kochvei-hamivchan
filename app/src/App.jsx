import { useEffect, useState } from 'preact/hooks';
import { loadCore, t } from './lib/content.js';
import { getProfiles, getActiveId, setActiveId } from './lib/storage.js';
import { ProfileCreate, ProfileSwitcher } from './screens/Profiles.jsx';
import { MapScreen } from './screens/MapScreen.jsx';
import { Practice } from './screens/Practice.jsx';
import { Results } from './screens/Results.jsx';

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
      />
    );
  } else {
    body = (
      <MapScreen
        profile={profile}
        content={content}
        onIsland={(skill) => setScreen({ name: 'practice', skill, run: Date.now() })}
        onSwitch={() => setScreen({ name: 'profiles' })}
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
