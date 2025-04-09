import '@expo/metro-runtime';
import { StatusBar } from 'expo-status-bar';
import { decode as atob } from 'base-64';
import { StyleSheet, View, Text, Button, Alert, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { PDFDocument, rgb } from 'pdf-lib';
import * as FileSystem from 'expo-file-system';
import { useState } from 'react';


const btoa = (str: string) => {
  try {
    return globalThis.btoa(str);
  } catch (e) {
    return Buffer.from(str).toString('base64');
  }
};


type SelectedFile = {
  uri: string;
  name: string;
  mimeType: string | null;
} | null;

export default function App() {
  const [selectedFile, setSelectedFile] = useState<SelectedFile>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'text/plain'],
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name || 'file',
          mimeType: file.mimeType || null
        });
        setDownloadUrl(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };


const convertToPDF = async () => {
  if (!selectedFile) {
    Alert.alert('Error', 'Please select a file first');
    return;
  }

  setIsConverting(true);

  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]); // A4 size

    // Add title
    page.drawText(`Converted from: ${selectedFile.name}`, {
      x: 50,
      y: 800,
      size: 18,
      color: rgb(0, 0, 0),
    });

    // Handle text file
    if (selectedFile.mimeType?.startsWith('text/')) {
      const textContent = await FileSystem.readAsStringAsync(selectedFile.uri);
      const lines = textContent.split('\n');
      let yPosition = 750;
      const fontSize = 12;
      const lineHeight = 14;

      for (const line of lines) {
        if (yPosition < 50) {
          yPosition = 750;
          page = pdfDoc.addPage([595, 842]);
        }
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: fontSize,
          maxWidth: 500,
          color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
      }

    } else if (selectedFile.mimeType?.startsWith('image/')) {
      // Handle image file
      const imageData = await FileSystem.readAsStringAsync(selectedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const imageBytes = Uint8Array.from(
        atob(imageData),
        (c) => c.charCodeAt(0)
      );

      let embeddedImage;
      if (selectedFile.mimeType === 'image/png') {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }

      const { width, height } = embeddedImage.scale(0.5);

      page.drawImage(embeddedImage, {
        x: 50,
        y: 400,
        width,
        height,
      });

    } else {
      // Fallback for other file types
      const fileInfo = await FileSystem.getInfoAsync(selectedFile.uri);
      page.drawText('File Conversion Details', {
        x: 50,
        y: 700,
        size: 16,
        color: rgb(0, 0, 0),
      });
      page.drawText(
        `Original File: ${selectedFile.name}\n` +
          `Type: ${selectedFile.mimeType || 'unknown'}\n` +
          `Size: ${
            fileInfo.exists ? (fileInfo.size / 1024).toFixed(2) + ' KB' : 'unknown'
          }\n` +
          `Converted on: ${new Date().toLocaleString()}`,
        {
          x: 50,
          y: 650,
          size: 12,
          color: rgb(0, 0, 0),
        }
      );
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    const pdfUri = `${FileSystem.documentDirectory}${selectedFile.name.replace(/\.[^/.]+$/, '')}.pdf`;

    // Convert to base64
    const base64String = Array.from(pdfBytes)
      .map((byte) => String.fromCharCode(byte))
      .join('');
    const base64 = btoa(base64String);

    await FileSystem.writeAsStringAsync(pdfUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    setDownloadUrl(pdfUri);
    Alert.alert('Success', 'File converted to PDF successfully!');
  } catch (error) {
    console.log('Conversion error:', error);
    Alert.alert('Error', `Failed to convert file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    setIsConverting(false);
  }
};


  const openPDF = async () => {
    if (!downloadUrl) return;
    
    try {
      // First check if file exists
      const fileInfo = await FileSystem.getInfoAsync(downloadUrl);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'PDF file not found');
        return;
      }

      // Create a content URI for the file
      const contentUri = await FileSystem.getContentUriAsync(downloadUrl);
      
      // Open the PDF with device's default viewer
      await Linking.openURL(contentUri);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', `Failed to open PDF: ${message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Converter</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          title="Select File"
          onPress={pickDocument}
          disabled={isConverting}
        />
        
        {selectedFile && (
          <Text style={styles.fileInfo}>Selected: {selectedFile.name}</Text>
        )}
        
        <Button
          title="Convert to PDF"
          onPress={convertToPDF}
          disabled={!selectedFile || isConverting}
        />
        
        {isConverting && <Text style={styles.status}>Converting...</Text>}
        
        {downloadUrl && (
          <Button
            title="Open PDF"
            onPress={openPDF}
          />
        )}
      </View>
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  fileInfo: {
    marginVertical: 10,
    textAlign: 'center',
  },
  status: {
    marginTop: 10,
    textAlign: 'center',
    color: '#666',
  },
});
