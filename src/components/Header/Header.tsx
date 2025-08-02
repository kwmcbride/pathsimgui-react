import styles from './Header.module.css'
import logo from '../../assets/logo.png'


export default function Header() {
  return (
    <div className={styles.headerContainer}>
      <img className={styles.logo} src={logo} alt='pathsim'/>
      <h2 className={styles.title}>PathSim</h2>

      <div className={styles.links}>
        <a className={styles.link} href='https://pathsim.readthedocs.io/en/latest/' target='_blank'>Documentation</a>
      </div>
    </div>
  );
};
