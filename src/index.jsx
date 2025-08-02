import React from 'react'
import { createRoot } from "react-dom/client";

import Header from './components/Header/Header'
import Editor from './components/Editor/Editor'
import Ticker from './components/Ticker/Ticker'
import Canvas from './components/Canvas/Canvas'

import './index.css'

const App = function() {
  return (
    <>
      <Header/>
      {/* <Ticker/> */}
      <Canvas/>
      {/* <Editor/> */}
    </>
  )
}

const view = App('pywebview')

const element = document.getElementById('app')
createRoot(element).render(view)