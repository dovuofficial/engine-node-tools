'use strict';

const fs = require('fs');
const path = require('path');
const { tasks, logger } = require('./helpers');

// Paths and constants
const CONFIG_FILE = path.resolve(__dirname, '../artefacts/config.json');
const ARTEFACTS_DIR = path.resolve(__dirname, '../artefacts');
const CONTEXT_DIR = path.resolve(ARTEFACTS_DIR, 'context');
const DEFAULT_CONTEXT = 'default';

// Default config structure
var config = {
  context: {
    name: null,
  },
  workflow_key: 'elv_workflow',
  users: {
    standard_registry: {},
    supplier: {},
    verifier: {},
  },
};

// Ensure `artefacts` and `context` directories exist
const ensureDirectories = () => {
  if (!fs.existsSync(ARTEFACTS_DIR)) {
    fs.mkdirSync(ARTEFACTS_DIR, { recursive: true });
    console.log('Created artefacts directory.');
  }

  if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    console.log('Created context directory.');
  }
};

// Load the global configuration
const loadConfig = () => {
  ensureDirectories();

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      config = { ...config, ...fileData }; // Merge with default structure
    } catch (err) {
      console.error('Error loading configuration file:', err);
    }
  } else {
    saveConfig(); // Save default config if file doesn't exist
  }
};

// Check or create a context folder and files
const checkContext = () => {
  const contextName = config.context.name || DEFAULT_CONTEXT;
  const contextFolder = path.join(CONTEXT_DIR, contextName);

  if (!fs.existsSync(contextFolder)) {
    fs.mkdirSync(contextFolder, { recursive: true });
    console.log(`Created context folder: ${contextFolder}`);
  }

  const contextFile = path.join(contextFolder, 'config.json');

  fs.writeFileSync(contextFile, JSON.stringify(config, null, 2), 'utf-8');
};

// Save the global configuration to file
const saveConfig = (file = CONFIG_FILE) => {
  try {
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
    checkContext();
  } catch (err) {
    console.error('Error saving configuration file:', err);
  }
};

const update = (path, value) => {
  const keys = path.split('.');
  let current = config;

  while (keys.length > 1) {
    const key = keys.shift();
    if (!current[key]) current[key] = {};
    current = current[key];
  }
  current[keys[0]] = value;

  // Avoid nesting the context key
  if (path.startsWith('context.') && path !== 'context.name') {
    logger.warn(`Skipping nested context update for path: ${path}`);
    return;
  }

  saveConfig(); // Persist the updated configuration
  logger.info(`Updated ${path} in configuration.`);
};


// Generate schema object from keys
const generateSchemaObject = (keys) => {
  const schema = {};

  keys.forEach((key) => {
    const parts = key.split('.');
    let current = schema;

    for (let i = 0; i < parts.length; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = i === parts.length - 1 ? '' : {};
      }
      current = current[parts[i]];
    }
  });

  return schema;
};

// Add schema to the context
const addSchemaToContext = (schemaName, keys, force = false) => {
  const contextName = config.context.name || DEFAULT_CONTEXT;
  const contextFolder = path.join(CONTEXT_DIR, contextName);

  if (!fs.existsSync(contextFolder)) {
    console.error('Context folder does not exist. Please set the context first.');
    return;
  }

  const schemaFile = path.join(contextFolder, `${schemaName}.spec.json`);
  const writableFile = path.join(contextFolder, `${schemaName}.json`);

  const schemaObject = generateSchemaObject(keys);

  // Write the spec file (overwrite allowed)
  try {
    fs.writeFileSync(schemaFile, JSON.stringify(schemaObject, null, 2), 'utf-8');
    console.log(`Spec file added: ${schemaFile}`);
  } catch (err) {
    console.error('Error writing spec file:', err);
  }

  // Write the writable file (only if it doesn't exist)
  if (!fs.existsSync(writableFile) || force) {
    try {
      fs.writeFileSync(writableFile, JSON.stringify(schemaObject, null, 2), 'utf-8');
      console.log(`Writable JSON file added: ${writableFile}`);
    } catch (err) {
      console.error('Error writing writable JSON file:', err);
    }
  } else {
    console.log(`Writable JSON file already exists: ${writableFile}`);
  }
};

// Import schema or payload from context folder
const importSchema = (key) => {
  const contextName = config.context.name || DEFAULT_CONTEXT;
  const contextFolder = path.join(CONTEXT_DIR, contextName);
  const schemaFile = path.join(contextFolder, `${key}.json`);

  if (!fs.existsSync(schemaFile)) {
    console.error(`Schema file not found: ${schemaFile}`);
    return false;
  }

  try {
    return JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
  } catch (err) {
    console.error('Error reading schema file:', err);
    return null;
  }
};

// Reauthenticate an actor and update the token in the configuration
const reauthenticateActor = async (role) => {
  const actor = config.users[role];

  if (!actor) {
    logger.warn(`Actor with role: [${role}] not present in configuration`);
    return;
  }

  const { token } = await tasks.user().login(actor);

  update(`users.${role}.token`, token);

  return token;
};

// Load a context from its folder
const loadContext = (name) => {
  const contextFolder = path.join(CONTEXT_DIR, name);
  const contextFile = path.join(contextFolder, 'config.json');

  if (!fs.existsSync(contextFile)) {
    console.error(`Context file not found: ${contextFile}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(contextFile, 'utf-8'));
  } catch (err) {
    console.error('Error reading context file:', err);
    return null;
  }
};

// Update context configuration
const updateContext = (contextData) => {
  const contextName = config.context.name || DEFAULT_CONTEXT;
  const contextFolder = path.join(CONTEXT_DIR, contextName);
  const contextFile = path.join(contextFolder, 'config.json');

  try {
    fs.writeFileSync(contextFile, JSON.stringify(contextData, null, 2), 'utf-8');
    logger.info(`Context configuration updated for: ${contextName}`);
  } catch (err) {
    console.error('Error writing context configuration:', err);
  }
};

// Expose configuration and utilities
module.exports = () => {
  loadConfig();

  return {
    ...config, // Export the default configuration structure
    reauthenticateActor,
    update,
    addSchemaToContext,
    importSchema,
    loadContext,
    updateContext,
  };
};