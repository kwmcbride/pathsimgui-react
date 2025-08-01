# pathsimgui-react

This is a project aimed at creating an interactive program for PathSim. It is based on the pywebview react boilerplate template found [here](https://github.com/r0x0r/pywebview-react-boilerplate). This code has been modernized and updated to use uv as the python manager.

Since this is based on the template mentioned above, if follows the in the same thread as before:


> It sets up the development environment, install dependencies, as well as provides scripts for building an executable. Stack is based on pywebview, React, SASS, Parcel bundler, pyinstaller (Windows/Linux) and py2app (macOS).


## Requirements
- Python 3
- Node
- uv

## Installation

``` bash
npm run init
```

This will create a virtual environment and install Node dependencies. Alternatively you can perform these steps manually. (this might create the uv package for you, I need to test this)

``` bash
npm install
uv add -r requirements.txt 
```

This might still apply:

>On Linux systems installation system makes educated guesses. If you run KDE, QT dependencies are installed, otherwise GTK is chosen. `apt` is used for installing GTK dependencies. In case you are running a non apt-based system, you will have to install GTK dependencies manually. See [installation](https://pywebview.flowrl.com/guide/installation.html) for details.

## Usage

To launch the application.

``` bash
npm run start
```

To build an executable. The output binary will be produced in the `dist` directory.

``` bash
npm run build
```

To start a development server (only for testing frontend code).

``` bash
npm run dev
```


## Bug reporting

For any bugs pertaining to pathsimgui-react: [pathsimgui-reacts's repository](https://github.com/kwmcbride/pathsimgui-react).


For any bugs pertaining to pathsim: [pathsim's repository](https://github.com/milanofthe/pathsim).


For any bugs pertaining to pywebview: [pywebview's repository](https://github.com/r0x0r/pywebview).