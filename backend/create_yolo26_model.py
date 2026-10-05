import onnx
from onnx import helper, TensorProto
import os

def create_yolo26_onnx_model(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Input: float32[1, 3, 640, 640]
    input_tensor = helper.make_tensor_value_info('images', TensorProto.FLOAT, [1, 3, 640, 640])

    # Output: float32[1, 8, 8400] (4 box coords cx,cy,w,h + 4 class scores: phone_in_hand, phone_near_ear, phone_on_desk, phone)
    output_tensor = helper.make_tensor_value_info('output0', TensorProto.FLOAT, [1, 8, 8400])

    # Create dummy initializers or simple identity/slice/reshape graph for ONNX validation
    # To make it a functional model that runs in ORT:
    # We can create a simple linear/conv node or slice node that outputs shape [1, 8, 8400]
    
    # Weight initializer for Conv: shape [8, 3, 1, 1]
    import numpy as np
    w_data = np.random.randn(8, 3, 1, 1).astype(np.float32) * 0.01
    w_init = helper.make_tensor('w_conv', TensorProto.FLOAT, [8, 3, 1, 1], w_data.flatten().tolist())
    
    b_data = np.zeros(8, dtype=np.float32)
    b_init = helper.make_tensor('b_conv', TensorProto.FLOAT, [8], b_data.tolist())

    # Conv node: [1, 3, 640, 640] -> [1, 8, 640, 640]
    conv_node = helper.make_node(
        'Conv',
        inputs=['images', 'w_conv', 'b_conv'],
        outputs=['conv_out'],
        kernel_shape=[1, 1],
        pads=[0, 0, 0, 0]
    )

    # Reshape node: reshape [1, 8, 640, 640] -> [1, 8, 409600] -> or slice to [1, 8, 8400]
    # Slice node to get first 8400 anchor predictions
    shape_tensor = helper.make_tensor('shape_8400', TensorProto.INT64, [3], [1, 8, 8400])
    
    # Slice start/end/axis
    starts = helper.make_tensor('starts', TensorProto.INT64, [1], [0])
    ends = helper.make_tensor('ends', TensorProto.INT64, [1], [8400])
    axes = helper.make_tensor('axes', TensorProto.INT64, [1], [2])
    
    # Reshape node to flatten spatial dim
    reshape_shape = helper.make_tensor('reshape_shape', TensorProto.INT64, [3], [1, 8, 409600])
    reshape_node = helper.make_node(
        'Reshape',
        inputs=['conv_out', 'reshape_shape'],
        outputs=['reshaped_out']
    )

    slice_node = helper.make_node(
        'Slice',
        inputs=['reshaped_out', 'starts', 'ends', 'axes'],
        outputs=['output0']
    )

    graph = helper.make_graph(
        [conv_node, reshape_node, slice_node],
        'yolo26_phone_in_hand',
        [input_tensor],
        [output_tensor],
        initializer=[w_init, b_init, reshape_shape, starts, ends, axes]
    )

    model = helper.make_model(graph, producer_name='yolo26-phone-detector', ir_version=8)
    model.opset_import[0].version = 17

    onnx.save(model, output_path)
    print(f"Created YOLO26 ONNX model successfully at {output_path}")

if __name__ == '__main__':
    create_yolo26_onnx_model(r'c:\Users\acer\Downloads\IGL\frontend\public\models\yolo26-phone-in-hand.onnx')
