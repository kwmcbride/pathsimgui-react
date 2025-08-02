// import { usePythonState } from '../../hooks/pythonBridge'
import Block from '../Block/Block';
import styles from './Canvas.module.css'

export default function Canvas() {

  // Todo: Implement the canvas functionality
  // Make zoomable, panable, and interactive
  // Colors, grids, etc. All optionable

  


  return (
    <>
      <svg id="blockCanvas" className={styles.canvasContainer} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 1600">
          <rect x="0" y="0" width="100%" height="100%" fill="#d1d1d1ff"/>
          <Block id="block1" />
          <text x="600" y="400" textAnchor="middle" fontSize="48" fill="#333">Canvas Component</text>
          <text x="600" y="500" textAnchor="middle" fontSize="24" fill="#666">This is a placeholder for the canvas.</text>
      </svg>
    </>

  )
}
