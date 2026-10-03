import GlassBridgeScreen from './glassBridge/GlassBridgeScreen.jsx';
import RedLightScreen from './redLight/RedLightScreen.jsx';

// gameId -> дэлгэцийн компонент. Шинэ тоглоом нэмэхэд энд нэг мөр нэмнэ.
export const gameScreens = {
  'glass-bridge': GlassBridgeScreen,
  'red-light-green-light': RedLightScreen,
};
