import React from 'react'
import { createRoot } from "react-dom/client";

import Header from './components/Header/Header'
import Editor from './components/Editor/Editor'
import Ticker from './components/Ticker/Ticker'
import Canvas from './components/interface/Canvas/Canvas2'
// import AppInitializer from './components/interface/AppInitializer/AppInitializer'

import './index.css'

const App = function() {
  return (
    <>
    {/* <AppInitializer> */}
      <Header/>
      {/* <Ticker/> */}
      <Canvas/>
      {/* <Editor/> */}
      {/* </AppInitializer> */}
    </>
  )
}

const view = App('pywebview')

const element = document.getElementById('app')
createRoot(element).render(view)