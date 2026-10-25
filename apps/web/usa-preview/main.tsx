import React from 'react';
import { createRoot } from 'react-dom/client';
import USPreview from '../src/USPreview';

/** Dedicated entrypoint: deliberately excludes Brazilian app roots and integrations. */
const root = document.getElementById('root');
if (!root) throw new Error('NexOffices USA root element is missing');
createRoot(root).render(<React.StrictMode><USPreview /></React.StrictMode>);
