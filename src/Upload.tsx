import { CircularProgress, Container, Grid, Typography } from "@mui/material";
import { ReactElement, useCallback, useState } from "react";

export type FileType = 'tsv' | 'csv' | 'other';

// Function to read the uploaded file
function readFile(file: any) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// Function to split the file into chunks based on the numeric value in the second column
function splitFile_tsv(fileData) {
    const lines = fileData.trim().split('\n'); // Split file into lines
    const chunks = new Map(); // Use a map to store chunks indexed by the numeric value in the second column
    lines.forEach((line) => {
        const columns = line.split('\t'); // Split line into columns
        const key = parseInt(columns[1]); // Parse numeric value in the second column
        if (key >= 1 && key <= 22) {
            // Check if the numeric value is valid
            if (!chunks.has(key)) {
                // If key does not exist in map, create new array
                chunks.set(key, []);
            }
            chunks.get(key).push(line); // Add line to corresponding chunk array
        }
    });
    return Array.from(chunks.values()); // Return array of chunk arrays
}
//TODO: This needs to be fixed. It returns an empty list

function splitFile_csv(fileData) {
    const lines = fileData.trim().split('\n'); // Split file into lines
    const chunks = new Map(); // Use a map to store chunks indexed by the numeric value in the second column
    lines.forEach((line) => {
        const trimline = line.replace(/['"]/g, '');
        //console.log("Line:", trimline);
        const columns = line.split(',').map(col => col.replace(/^['"]|['"]$/g, '')); // Split line into columns
        const key = parseInt(columns[1]); // Parse numeric value in the second column
        // console.log("csv column:", columns)
        if (key >= 1 && key <= 22) {
            // Check if the numeric value is valid
            if (!chunks.has(key)) {
                // If key does not exist in map, create new array
                chunks.set(key, []);
            }
            chunks.get(key).push(trimline); // Add line to corresponding chunk array
        }
    });
    //console.log("Chunks:", chunks)
    return Array.from(chunks.values()); // Return array of chunk arrays
}

function saveFilesToAPIGateway(chunks: Array<string>) {
    const API_GATEWAY_ENDPOINT = 'https://k5ufaiux0h.execute-api.us-west-2.amazonaws.com/calc/CalcPRS'; // API Gateway endpoint URL

    const CHUNKS_PER_BATCH = 1;
    let batchCount = 0;

    const uploadNextBatch = () => {
        if (batchCount < chunks.length) {
            const batch = chunks.slice(batchCount, batchCount + CHUNKS_PER_BATCH);
            const formData = new FormData();
            batch.forEach((chunk, index) => {
                const blob = new Blob([chunk.join('\n')], { type: 'text/plain' });
                formData.append(`file_${batchCount + index + 1}`, blob, `chunk_${batchCount + index + 1}.txt`);
            });

            // Send the batch of files to the API Gateway endpoint
            fetch(API_GATEWAY_ENDPOINT, {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    if (response.ok) {
                        console.log(`Batch ${batchCount / CHUNKS_PER_BATCH + 1} uploaded successfully`);
                        batchCount += CHUNKS_PER_BATCH;
                        uploadNextBatch(); // Upload the next batch
                    } else {
                        console.error(`Failed to upload batch ${batchCount / CHUNKS_PER_BATCH + 1}`);
                    }
                })
                .catch(error => console.error('Error uploading batch:', error));
        }
    };

    uploadNextBatch(); // Start uploading the first batch
}

async function loadCSV(url: string) {

    const response = await fetch(url);
    const csvText = await response.text();
    const rows = csvText.trim().split('\n').map(row => row.split(','));
if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
    // Parse CSV header and rows into an array of objects
    const headers = rows[0];
    return rows.slice(1).map(row => {
        let obj: { [key: string]: any } = {};
        row.forEach((value: string, index: number) => {
            obj[headers[index].trim()] = isNaN(parseFloat(value)) ? value : parseFloat(value);
        });
        return obj;
    });
}

async function loadTSV(url: string): Promise<any[]> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
  
    const tsvText = await response.text();
    
    // Split text into lines and parse each line into an object
    const lines = tsvText.trim().split("\n");
    const headers = lines[0].split("\t"); // Split header row by tab
  
    return lines.slice(1).map(line => {
      const values = line.split("\t"); // Split each row by tab
      const obj: { [key: string]: any } = {};
      headers.forEach((header, index) => {
        obj[header] = isNaN(parseFloat(values[index])) ? values[index] : parseFloat(values[index]);
      });
      return obj;
    });
  }

function predict(coefficients: { [key: string]: number }, data: { [key: string]: number }[]): number[] {
    return data.map((row) => {
      let prediction = coefficients["(Intercept)"] || 0; // Start with intercept
      for (const [key, value] of Object.entries(row)) {
        if (coefficients[key] !== undefined) {
          prediction += coefficients[key] * value;
        }
      }
      const pred: number = prediction
      return pred;
    });
  }

function getExt(fileName: string): string {
    const base = fileName.split('/').pop() || '';
    const dotIndex = base.lastIndexOf('.');
    return dotIndex >= 0 ? base.slice(dotIndex) : '';
}
 
export async function detectFileType(file: File): Promise<FileType> {
    const isGzipped = file.name.endsWith('.gz');
  
    if (isGzipped) {
      throw new Error('Gzipped files not supported in browser environment without additional libraries');
    }
  
    const text = await file.text();
    const lines = text.split(/\r?\n/);
  
    let delimiter: '\t' | ',' | null = null;
    let columnCount: number | null = null;
    let lineCount = 0;
  
    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }
  
      lineCount++;
  
      if (delimiter === null) {
        if (line.includes('\t')) {
          delimiter = '\t';
        } else if (line.includes(',')) {
          delimiter = ',';
        } else {
          return 'other';
        }
      }
  
      const columns = line.split(delimiter);
      if (columnCount === null) {
        columnCount = columns.length;
      } else if (columns.length !== columnCount) {
        return 'other';
      }
    }
  
    if (lineCount === 0 || delimiter === null) {
      return 'other';
    }
  
    return delimiter === '\t' ? 'tsv' : 'csv';
  }

async function loadDataAndAdjust(pop_model_Url: string, pop_var_model_Url: string, 
    prs_raw: number, loadings: Array<number>) {

    const pop_model_coef = await loadCSV(pop_model_Url)
    const pop_var_model_coef = await loadCSV(pop_var_model_Url)

    const coefficients_pop = pop_model_coef.reduce((acc: { [key: string]: number }, row: any) => {
        // Remove extra quotes from keys and values
        const term = row["\"\""].replace(/['"]+/g, "");
        const estimate = row["\"Estimate\""]; // Estimate is already a number
        acc[term] = estimate;
        return acc;
      }, {});

    console.log(pop_model_coef)
    console.log(coefficients_pop)

    const coefficients_var_pop = pop_var_model_coef.reduce((acc: { [key: string]: number }, row: any) => {
        // Remove extra quotes from keys and values
        const term = row["\"\""].replace(/['"]+/g, "");
        const estimate = row["\"Estimate\""]; // Estimate is already a number
        acc[term] = estimate;
        return acc;
      }, {});

    console.log(pop_var_model_coef)
    console.log(coefficients_var_pop)
    
    const newData = {
        ...loadings.reduce((acc, value, index) => {
          acc[`PC${index + 1}`] = value;
          return acc;
        }, {} as { [key: string]: number }),
        prs_raw,
      };
    
    const nom: number = predict(coefficients_pop, [newData])
    const denom: number = predict(coefficients_var_pop, [newData])

    const prs_adj = (prs_raw - nom)/Math.sqrt(denom)
    return prs_adj;
}

async function processChunks(chromosomes: Array<Array<string>>): Promise<number> {
    const chromos = chromosomes;
    const resultsAllChunks = await Promise.all(chromos.map(async (chromosome) => {
        const body = chromosome.join("\n");
        const response = await fetch('https://k5ufaiux0h.execute-api.us-west-2.amazonaws.com/calc/CalcPRS', {
            method: 'POST',
            body
        });
        return await response.json();
    }));
    console.log(resultsAllChunks)
    const D = await loadTSV("http://localhost:8000/1000G_lambda.txt")
    console.log("D:", D)
    let totalPrsRaw = 0;
    let loadings = Array(10).fill(0);
    resultsAllChunks.forEach(obj => {

        totalPrsRaw += obj.prs;
        obj.loadings.forEach((value: number, index: number) => {
            loadings[index] += value;
        });
    });
    console.log("PRS (raw):", totalPrsRaw)
    console.log("Loadings (pre):", loadings)
    for (let i = 0; i < 10; i++){
        loadings[i] = loadings[i] / D[i]["out.d"]
    }

    console.log("Loadings (norm):", loadings)
    const pop_model_Url = 'http://localhost:8000/population_model_summary.csv'
    const pop_var_model_Url = 'http://localhost:8000/population_var_model_summary.csv'

    const score_adj = loadDataAndAdjust(pop_model_Url, pop_var_model_Url, totalPrsRaw, loadings)

    //TODO: Write a function to adjust PRS 
    //const totalScore = resultsAllChunks.reduce((acc, val) => acc + parseFloat(val), 0);
    return score_adj;
}


async function processFile(file: any): Promise<number | null> {
    let score = null;
    try {

        const ft = await detectFileType(file);
        console.log("Guessed Filetype:", ft);
        if (ft === 'tsv') {
            const fileData = await readFile(file);
            const chunks = splitFile_tsv(fileData) as Array<Array<string>>;
            console.log("chunks:", chunks)
            score = await processChunks(chunks);
        } else if (ft === 'csv' ) {
            const fileData = await readFile(file);
            //This needs to look like 'rs123\t1\t12345\tG\tA' or 'rs123\t1\t12345\tGA'
            const chunks = splitFile_csv(fileData) as Array<Array<string>>;
            console.log("chunks:", chunks)
            score = await processChunks(chunks);
        } else {
            console.error('Unsupported file format!')
        }
    } catch (error) {
        console.error('Error processing file:', error);
    }
    return score;

}

function Upload(): ReactElement {

    const [appState, setAppState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [score, setScore] = useState<number | null>(null);
    const handleFileUpload = useCallback((event: any) => {

        setAppState('loading');
        const file = event.target.files[0];
        if (file) {
            (async () => {
                try {
                    setScore(await processFile(file));
                    setAppState('success');
                } catch (error) {
                    setAppState('error');
                }
            })();
        }
    }, []);


    return (
        <Container>
            <Grid container>
                <Grid item xs={12}>
                    {appState === 'idle' &&
                        <>
                            <Typography variant="h1">Upload</Typography>
                            <input type="file" id="fileInput" accept=".txt" onChange={handleFileUpload}></input>
                        </>
                    }
                    {appState === 'loading' &&
                        <>
                            <Typography variant="h1">Processing...</Typography>
                            <CircularProgress />
                        </>
                    }
                    {
                        appState === 'success' && score !== null &&
                        <>
                            <Typography variant="h1">Score</Typography>
                            <Typography variant="h2">{score}</Typography>
                        </>
                    }
                </Grid>
            </Grid>
        </Container>
    )
}

export default Upload;
