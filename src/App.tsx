import { CssBaseline, Toolbar, Typography } from '@mui/material';
import AppBar from '@mui/material/AppBar';
import React from 'react';
import './App.css';
import Upload from './Upload';

function App() {

  return (
    
    <React.Fragment>
      <CssBaseline />
      {/* <AppBar position="static" style={{position:'relative'}}>
        <Toolbar>
          <Typography variant="h6" color="inherit" noWrap>
            PRS Web tool
          </Typography>
        </Toolbar>
      </AppBar> */}
      <main>
      <Upload />
      
        
      </main>
      
    </React.Fragment>
  )
}

export default App
